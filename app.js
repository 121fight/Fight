const app = {
    user: {},
    currentRoom: null,
    
    init() {
        this.preventBackButton();
        this.bindEvents();
        this.loadProfile();
        
        // Flow control
        if (!localStorage.getItem('termsAccepted')) {
            this.showScreen('screen-terms');
        } else if (!this.user.username) {
            this.showScreen('screen-profile');
        } else {
            this.showScreen('screen-home');
        }
    },

    // PREVENT BROWSER BACK BUTTON
    preventBackButton() {
        history.pushState(null, null, location.href);
        window.onpopstate = function () {
            history.go(1); // Force state forward
            // Optionally alert user
            // alert("Please use the 'Leave' or 'Exit' buttons inside the app.");
        };
    },

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
        window.scrollTo(0, 0); // Reset scroll
    },

    bindEvents() {
        // Terms
        document.getElementById('terms-checkbox').addEventListener('change', (e) => {
            document.getElementById('btn-accept-terms').disabled = !e.target.checked;
        });
        document.getElementById('btn-accept-terms').addEventListener('click', () => {
            localStorage.setItem('termsAccepted', 'true');
            this.showScreen('screen-profile');
        });

        // Profile
        document.getElementById('avatar-input').addEventListener('change', this.handleAvatarUpload.bind(this));
        document.getElementById('btn-save-profile').addEventListener('click', this.saveProfile.bind(this));

        // Home Modals
        const closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', closeModals));
        
        document.getElementById('btn-show-create').addEventListener('click', () => {
            document.getElementById('modal-create').classList.remove('hidden');
        });
        document.getElementById('btn-show-join').addEventListener('click', () => {
            document.getElementById('modal-join').classList.remove('hidden');
        });
        document.getElementById('btn-info').addEventListener('click', () => {
            this.showScreen('screen-terms');
        });

        // Create / Join Logic
        document.getElementById('btn-create-room').addEventListener('click', () => {
            const name = document.getElementById('create-room-name').value;
            if(!name) return alert("Enter room name");
            closeModals();
            webrtc.createRoom(name);
        });

        document.getElementById('btn-join-room').addEventListener('click', () => {
            const code = document.getElementById('join-room-code').value;
            if(code.length !== 4) return alert("Enter 4 digit code");
            closeModals();
            webrtc.joinRoom(code);
        });

        // Room Logic (LEAVE BUTTON)
        document.getElementById('btn-leave-room').addEventListener('click', () => {
            const confirmLeave = confirm("Are you sure you want to leave the room?");
            if(confirmLeave) {
                webrtc.leaveRoom();
                this.showScreen('screen-home');
            }
        });

        document.getElementById('btn-send-chat').addEventListener('click', this.sendChat.bind(this));
        document.getElementById('btn-toggle-mic').addEventListener('click', webrtc.toggleMic.bind(webrtc));

        // Report Logic (SENDS TO TELEGRAM)
        document.getElementById('btn-submit-report').addEventListener('click', () => {
            const targetUser = document.getElementById('report-user-name').textContent;
            const reason = document.getElementById('report-reason').value;
            
            // Format message for Telegram bot
            const message = `🚨 *New Report* 🚨%0A%0A*Target User:* ${targetUser}%0A*Reporter ID:* ${this.user.deviceId}%0A*Reason:* ${reason}`;
            const telegramUrl = `https://t.me/Nightworrormic_bot?start=${encodeURIComponent('report')}`;
            
            // Open Telegram
            window.open(telegramUrl, '_blank');
            document.getElementById('modal-report').classList.add('hidden');
        });
    },

    exitApp() {
        if(confirm("Exit Application?")) {
            // Because scripts can't close tabs they didn't open in Chrome, 
            // we redirect to a blank page or google.
            window.location.replace("about:blank");
        }
    },

    handleAvatarUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('avatar-preview').src = event.target.result;
                this.user.avatar = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    },

    saveProfile() {
        const username = document.getElementById('username-input').value;
        const gender = document.getElementById('gender-input').value;
        const language = document.getElementById('language-input').value;

        if(!username || !gender || !language) return alert("Please fill all fields");

        this.user.username = username;
        this.user.gender = gender;
        this.user.language = language;
        this.user.deviceId = localStorage.getItem('deviceId');
        if(!this.user.avatar) this.user.avatar = document.getElementById('avatar-preview').src;

        localStorage.setItem('userProfile', JSON.stringify(this.user));
        this.showScreen('screen-home');
    },

    loadProfile() {
        const saved = localStorage.getItem('userProfile');
        if (saved) {
            this.user = JSON.parse(saved);
            document.getElementById('avatar-preview').src = this.user.avatar;
            document.getElementById('username-input').value = this.user.username;
            document.getElementById('gender-input').value = this.user.gender;
            document.getElementById('language-input').value = this.user.language;
        }
    },

    updateRoomUI(roomData) {
        document.getElementById('display-room-name').textContent = roomData.name;
        document.getElementById('display-room-code').textContent = "Code: " + roomData.code;
        
        // Reset Seats
        for(let i=1; i<=8; i++) {
            const seat = document.getElementById(`seat-${i}`);
            seat.querySelector('span').textContent = i===1 ? "Admin" : "Empty";
            seat.querySelector('.avatar-circle').style.backgroundImage = 'none';
            seat.onclick = null;
        }

        // Render Speakers
        roomData.speakers.forEach((spk, index) => {
            if(index < 8) {
                const seat = document.getElementById(`seat-${index+1}`);
                seat.querySelector('span').textContent = spk.username;
                seat.querySelector('.avatar-circle').style.backgroundImage = `url(${spk.avatar})`;
                seat.onclick = () => this.openReport(spk.username);
            }
        });

        // Render Audience
        const audList = document.getElementById('audience-list');
        audList.innerHTML = "";
        roomData.audience.forEach(aud => {
            const div = document.createElement('div');
            div.className = "audience-item";
            div.innerHTML = `<img src="${aud.avatar}"><span>${aud.username}</span>`;
            div.onclick = () => this.openReport(aud.username);
            audList.appendChild(div);
        });
    },

    appendChat(username, text) {
        const box = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = "chat-msg";
        div.innerHTML = `<span>${username}</span> <p>${text}</p>`;
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    },

    sendChat() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if(text) {
            webrtc.broadcastChat(text);
            this.appendChat(this.user.username, text);
            input.value = "";
        }
    },

    openReport(username) {
        if(username === this.user.username) return; // Can't report yourself
        document.getElementById('report-user-name').textContent = username;
        document.getElementById('modal-report').classList.remove('hidden');
    }
};

// Wait for config before starting
document.addEventListener('ConfigLoaded', () => app.init());
