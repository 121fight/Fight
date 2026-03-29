// Serverless WebRTC Mesh logic using PeerJS public signaling
const webrtc = {
    peer: null,
    connections: [],
    roomData: { name: "", code: "", speakers: [], audience: [] },
    isHost: false,
    myStream: null,
    
    async initPeer(id) {
        return new Promise((resolve, reject) => {
            this.peer = new Peer(id); // Uses PeerJS free public server
            this.peer.on('open', resolve);
            this.peer.on('error', reject);
        });
    },

    async createRoom(name) {
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        this.isHost = true;
        this.roomData.name = name;
        this.roomData.code = code;
        this.roomData.speakers = [app.user];
        this.roomData.audience = [];
        
        try {
            await this.initPeer('vc-room-' + code);
            app.showScreen('screen-room');
            app.updateRoomUI(this.roomData);
            this.listenForPeers();
            await this.enableMic();
        } catch (e) {
            alert("Error creating room. Code might be in use. Try again.");
        }
    },

    async joinRoom(code) {
        this.isHost = false;
        try {
            await this.initPeer(); // Generate random ID for guest
            
            const conn = this.peer.connect('vc-room-' + code);
            conn.on('open', () => {
                conn.send({ type: 'join', user: app.user });
                this.connections.push(conn);
                
                conn.on('data', (data) => {
                    if(data.type === 'state') {
                        this.roomData = data.state;
                        app.showScreen('screen-room');
                        app.updateRoomUI(this.roomData);
                    }
                    if(data.type === 'chat') {
                        app.appendChat(data.username, data.text);
                    }
                });
            });

            // Listen for host audio
            this.peer.on('call', (call) => {
                call.answer();
                call.on('stream', (remoteStream) => {
                    this.playStream(remoteStream);
                });
            });

        } catch(e) {
            alert("Room not found!");
        }
    },

    listenForPeers() {
        // Host logic to manage incoming members
        this.peer.on('connection', (conn) => {
            this.connections.push(conn);
            conn.on('data', (data) => {
                if(data.type === 'join') {
                    // Fill seats up to 8, else audience
                    if(this.roomData.speakers.length < 8) {
                        this.roomData.speakers.push(data.user);
                        if(this.myStream) {
                            this.peer.call(conn.peer, this.myStream);
                        }
                    } else {
                        this.roomData.audience.push(data.user);
                    }
                    this.broadcastState();
                }
                if(data.type === 'chat') {
                    // Relay chat to everyone
                    this.broadcastChat(data.text, data.username);
                    app.appendChat(data.username, data.text);
                }
            });
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

    async enableMic() {
        try {
            this.myStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const btn = document.getElementById('btn-toggle-mic');
            btn.classList.remove('muted');
            
            // If host, stream to current connections immediately
            if(this.isHost && this.connections.length > 0) {
                this.connections.forEach(c => {
                   this.peer.call(c.peer, this.myStream); 
                });
            }
        } catch (e) {
            console.warn("Mic access denied");
        }
    },

    toggleMic() {
        const btn = document.getElementById('btn-toggle-mic');
        if (!this.myStream) {
            this.enableMic();
            return;
        }
        
        const audioTrack = this.myStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        
        if (audioTrack.enabled) {
            btn.classList.remove('muted');
        } else {
            btn.classList.add('muted');
        }
    },

    playStream(stream) {
        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        document.getElementById('audio-container').appendChild(audio);
    },

    leaveRoom() {
        if(this.myStream) this.myStream.getTracks().forEach(t => t.stop());
        if(this.peer) this.peer.destroy();
        document.getElementById('audio-container').innerHTML = '';
        this.connections = [];
        const btn = document.getElementById('btn-toggle-mic');
        btn.classList.add('muted');
    }
};
