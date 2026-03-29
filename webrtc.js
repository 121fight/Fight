const webrtc = {
    peer: null,
    connections: [], 
    roomData: { 
        name: "", 
        code: "", 
        seats: [null, null, null, null, null, null, null, null], 
        lockedSeats: [false, false, false, false, false, false, false, false],
        audience: [] 
    },
    isHost: false,
    myStream: null,

    async initPeer(id) {
        return new Promise((resolve, reject) => {
            // Added Google STUN servers for fast & reliable connection
            const options = {
                config: {
                    'iceServers': [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            };
            
            this.peer = id ? new Peer(id, options) : new Peer(options);
            
            this.peer.on('open', resolve);
            this.peer.on('error', (err) => {
                console.error("PeerJS Error:", err);
                reject(err);
            });
        });
    },

    async createRoom(name) {
        const btn = document.getElementById('btn-create-room');
        btn.textContent = "Creating...";
        btn.disabled = true;

        const code = Math.floor(1000 + Math.random() * 9000).toString();
        this.isHost = true;
        this.roomData.name = name;
        this.roomData.code = code;
        this.roomData.seats[0] = app.user; // Host takes seat 0

        try {
            await this.initPeer('vc-room-' + code);
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            btn.textContent = "Create";
            btn.disabled = false;
            
            app.showScreen('screen-room');
            app.updateRoomUI(this.roomData);
            this.listenForPeers();
            await this.enableMic();
        } catch (e) {
            btn.textContent = "Create";
            btn.disabled = false;
            alert("Error creating room. Code might be in use, try again.");
        }
    },

    async joinRoom(code) {
        this.isHost = false;
        const btn = document.getElementById('btn-join-room');
        btn.textContent = "Joining...";
        btn.disabled = true;

        try {
            await this.initPeer(); // Guest gets random ID
            const conn = this.peer.connect('vc-room-' + code, { reliable: true });

            // 7 seconds Timeout agar Host offline ho
            const joinTimeout = setTimeout(() => {
                btn.textContent = "Join";
                btn.disabled = false;
                alert("Room not found or Host is offline!");
            }, 7000);

            conn.on('open', () => {
                clearTimeout(joinTimeout); // Connection successful, stop timeout
                btn.textContent = "Join";
                btn.disabled = false;
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                
                app.showScreen('screen-room'); // Show room instantly
                
                conn.send({ type: 'join', user: app.user });
                this.connections.push(conn);
                
                conn.on('data', (data) => {
                    if(data.type === 'state') {
                        this.roomData = data.state;
                        app.updateRoomUI(this.roomData);
                    }
                    if(data.type === 'chat') app.appendChat(data.username, data.text);
                    if(data.type === 'command') this.handleHostCommand(data.command);
                });
            });

            this.peer.on('call', (call) => {
                call.answer();
                call.on('stream', (remoteStream) => {
                    this.playStream(remoteStream);
                });
            });

        } catch(e) {
            btn.textContent = "Join";
            btn.disabled = false;
            alert("Connection Error. Please try again.");
        }
    },

    // Host handles incoming connections
    listenForPeers() {
        this.peer.on('connection', (conn) => {
            this.connections.push(conn);
            conn.on('data', (data) => {
                if(data.type === 'join') {
                    this.roomData.audience.push(data.user);
                    conn.userDevice = data.user.deviceId; // Track for kicking
                    this.broadcastState(); // Update everyone
                    if(this.myStream) this.peer.call(conn.peer, this.myStream);
                }
                if(data.type === 'chat') {
                    this.broadcastChat(data.text, data.username);
                    app.appendChat(data.username, data.text);
                }
                if(data.type === 'req_seat') {
                    if(!this.roomData.seats[data.index] && !this.roomData.lockedSeats[data.index]) {
                        this.roomData.audience = this.roomData.audience.filter(u => u.deviceId !== data.user.deviceId);
                        this.roomData.seats[data.index] = data.user;
                        this.broadcastState();
                    }
                }
                if(data.type === 'leave_seat') {
                    this.roomData.seats[data.index] = null;
                    this.roomData.audience.push(data.user);
                    this.broadcastState();
                }
            });
        });
        
        // Host gets audio from speakers
        this.peer.on('call', (call) => {
            call.answer();
            call.on('stream', (remoteStream) => this.playStream(remoteStream));
        });
    },

    broadcastState() {
        if(!this.isHost) return;
        this.connections.forEach(c => c.send({ type: 'state', state: this.roomData }));
        app.updateRoomUI(this.roomData);
    },

    broadcastChat(text, username = app.user.username) {
        this.connections.forEach(c => c.send({ type: 'chat', text, username }));
    },

    amIOnSeat() {
        return this.roomData.seats.some(s => s && s.deviceId === app.user.deviceId);
    },

    requestSeat(index) {
        if(this.connections[0]) {
            this.connections[0].send({ type: 'req_seat', index: index, user: app.user });
            setTimeout(() => { if(this.amIOnSeat()) this.enableMic(); }, 1000);
        }
    },

    leaveSeat(index) {
        if(!this.isHost) {
            this.connections[0].send({ type: 'leave_seat', index: index, user: app.user });
            this.disableMic();
        }
    },

    hostCommand(cmd, targetDeviceId, seatIndex = null) {
        if(!this.isHost) return;

        if(cmd === 'lock_seat') this.roomData.lockedSeats[seatIndex] = true;
        if(cmd === 'unlock_seat') this.roomData.lockedSeats[seatIndex] = false;
        
        if(cmd === 'kick_seat') {
            const user = this.roomData.seats[seatIndex];
            this.roomData.seats[seatIndex] = null;
            if(user) this.roomData.audience.push(user);
            this.connections.forEach(c => {
                if(c.userDevice === targetDeviceId) c.send({ type: 'command', command: 'force_leave_seat' });
            });
        }

        if(cmd === 'mute') {
            this.connections.forEach(c => {
                if(c.userDevice === targetDeviceId) c.send({ type: 'command', command: 'force_mute' });
            });
        }

        if(cmd === 'kick_room') {
            this.roomData.audience = this.roomData.audience.filter(u => u.deviceId !== targetDeviceId);
            for(let i=1; i<8; i++) {
                if(this.roomData.seats[i] && this.roomData.seats[i].deviceId === targetDeviceId) {
                    this.roomData.seats[i] = null;
                }
            }
            this.connections.forEach(c => {
                if(c.userDevice === targetDeviceId) c.send({ type: 'command', command: 'force_kick_room' });
            });
        }
        
        this.broadcastState();
    },

    handleHostCommand(cmd) {
        if(cmd === 'force_mute') {
            if(this.myStream) {
                this.myStream.getAudioTracks()[0].enabled = false;
                document.getElementById('btn-toggle-mic').classList.add('muted');
                alert("Admin muted your microphone.");
            }
        }
        if(cmd === 'force_leave_seat') {
            this.disableMic();
            alert("Admin moved you to audience.");
        }
        if(cmd === 'force_kick_room') {
            alert("Admin removed you from the room.");
            this.leaveRoom();
            app.showScreen('screen-home');
        }
    },

    async enableMic() {
        try {
            this.myStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
            });
            const btn = document.getElementById('btn-toggle-mic');
            btn.classList.remove('muted');
            
            if(this.isHost) {
                this.connections.forEach(c => this.peer.call(c.peer, this.myStream)); 
            } else if (this.connections.length > 0) {
                this.peer.call(this.connections[0].peer, this.myStream);
            }
        } catch (e) { alert("Mic access denied or unavailable."); }
    },

    disableMic() {
        if(this.myStream) {
            this.myStream.getTracks().forEach(t => t.stop());
            this.myStream = null;
        }
        document.getElementById('btn-toggle-mic').classList.add('muted');
    },

    toggleMic() {
        if(!this.amIOnSeat() && !this.isHost) return alert("You must be on a seat to use mic.");
        
        const btn = document.getElementById('btn-toggle-mic');
        if (!this.myStream) {
            this.enableMic();
            return;
        }
        const audioTrack = this.myStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        
        if (audioTrack.enabled) btn.classList.remove('muted');
        else btn.classList.add('muted');
    },

    playStream(stream) {
        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.playsInline = true; 
        
        const playPromise = audio.play();
        if(playPromise !== undefined) {
            playPromise.catch(error => {
                document.body.addEventListener('click', () => audio.play(), {once:true});
            });
        }
        document.getElementById('audio-container').appendChild(audio);
    },

    leaveRoom() {
        this.disableMic();
        if(this.peer) this.peer.destroy();
        document.getElementById('audio-container').innerHTML = '';
        this.connections = [];
    }
};
