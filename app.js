const app = {
    user: {},
    selectedSeatIndex: null,
    reportTarget: { username: "", deviceId: "" },

    init() {
        this.preventBackButton();
        this.bindEvents();
        this.loadProfile();
        
        if (!localStorage.getItem('termsAccepted')) {
            this.showScreen('screen-terms');
        } else if (!this.user.username) {
            this.showScreen('screen-profile');
        } else {
            this.showScreen('screen-home');
        }
    },

    preventBackButton() {
        history.pushState(null, null, location.href);
        window.onpopstate = () => { history.go(1); };
    },

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
    },

    bindEvents() {
        document.getElementById('terms-checkbox').addEventListener('change', e => {
            document.getElementById('btn-accept-terms').disabled = !e.target.checked;
        });
        document.getElementById('btn-accept-terms').addEventListener('click', () => {
            localStorage.setItem('termsAccepted', 'true');
            this.showScreen('screen-profile');
        });

        document.getElementById('avatar-input').addEventListener('change', this.handleAvatarUpload.bind(this));
        document.getElementById('btn-save-profile').addEventListener('click', this.saveProfile.bind(this));

        const closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', closeModals));
        
        document.getElementById('btn-show-create').addEventListener('click', () => {
            document.getElementById('modal-create').classList.remove('hidden');
        });
        document.getElementById('btn-show-join').addEventListener('click', () => {
            document.getElementById('modal-join').classList.remove('hidden');
        });

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

        document.getElementById('btn-leave-room').addEventListener('click', () => {
            if(confirm("Are you sure you want to leave?")) {
                webrtc.leaveRoom();
                this.showScreen('screen-home');
            }
        });

        document.getElementById('btn-send-chat').addEventListener('click', this.sendChat.bind(this));
        document.getElementById('btn-toggle-mic').addEventListener('click', () => webrtc.toggleMic());

        // --- NEW REPORT SUBMISSION LOGIC ---
        document.getElementById('btn-submit-report').addEventListener('click', () => {
            const reason = document.getElementById('report-reason').value;
            
            // Format for Telegram
            const reportText = `🚨 *NEW REPORT* 🚨\n\n👤 *Offender Name:* ${this.reportTarget.username}\n🆔 *Offender Device ID:* ${this.reportTarget.deviceId}\n\n📝 *Reason:* ${reason}\n🛡️ *Reporter ID:* ${this.user.deviceId}`;
            
            // Copy to clipboard
            navigator.clipboard.writeText(reportText).then(() => {
                alert("Report details COPIED! \n\nPlease PASTE it in the Telegram Bot.");
                window.open(`https://t.me/Nightworrormic_bot`, '_blank');
                document.getElementById('modal-report').classList.add('hidden');
            }).catch(err => {
                // Fallback if clipboard fails
                window.open(`https://t.me/Nightworrormic_bot?text=${encodeURIComponent(reportText)}`, '_blank');
            });
        });
    },

    exitApp() {
        if(confirm("Exit Application?")) window.location.replace("about:blank");
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
        if(!username || !gender) return alert("Fill all fields");

        this.user.username = username;
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
        }
    },

    updateRoomUI(roomData) {
        document.getElementById('display-room-name').textContent = roomData.name;
        document.getElementById('display-room-code').textContent = "Code: " + roomData.code;
        
        const grid = document.getElementById('seat-grid');
        grid.innerHTML = "";

        for(let i=0; i<8; i++) {
            const occupant = roomData.seats[i];
            const isLocked = roomData.lockedSeats[i];
            
            const div = document.createElement('div');
            div.className = `seat ${i===0 ? 'admin-seat' : ''}`;
            div.onclick = () => this.handleSeatClick(i, occupant, isLocked);

            let bg = 'none';
            let name = "Empty";
            let lockHtml = isLocked ? `<div class="lock-icon">🔒</div>` : '';

            if(occupant) {
                bg = `url(${occupant.avatar})`;
                name = occupant.username;
                if(i===0) name = "👑 " + name;
                lockHtml = ''; 
            }

            div.innerHTML = `
                <div class="avatar-circle" style="background-image: ${bg}">${occupant ? '' : '+'}</div>
                <span>${name}</span>
                ${lockHtml}
            `;
            grid.appendChild(div);
        }

        const audList = document.getElementById('audience-list');
        audList.innerHTML = "";
        roomData.audience.forEach(aud => {
            const div = document.createElement('div');
            div.className = "audience-item";
            div.innerHTML = `<img src="${aud.avatar}"><span>${aud.username}</span>`;
            div.onclick = () => this.handleAudienceClick(aud);
            audList.appendChild(div);
        });
    },

    handleSeatClick(index, occupant, isLocked) {
        this.selectedSeatIndex = index;
        const modal = document.getElementById('modal-seat-action');
        const title = document.getElementById('action-target-name');
        const container = document.getElementById('action-buttons-container');
        container.innerHTML = ""; 

        const isMeHost = webrtc.isHost;
        const myId = this.user.deviceId;

        if (occupant) {
            title.textContent = occupant.username;
            
            if (occupant.deviceId === myId) {
                if (index !== 0) {
                    container.appendChild(this.createBtn("Leave Seat", "warning-btn", () => webrtc.leaveSeat(index)));
                } else {
                    title.textContent += " (You are Host)";
                }
            } else {
                if (isMeHost) {
                    container.appendChild(this.createBtn("Mute User", "warning-btn", () => webrtc.hostCommand('mute', occupant.deviceId)));
                    container.appendChild(this.createBtn("Kick to Audience", "danger-btn", () => webrtc.hostCommand('kick_seat', occupant.deviceId, index)));
                    container.appendChild(this.createBtn("Remove from Room", "danger-btn", () => webrtc.hostCommand('kick_room', occupant.deviceId)));
                } else {
                    // Send to Report Screen
                    container.appendChild(this.createBtn("Report User", "danger-btn", () => this.openReportModal(occupant.username, occupant.deviceId)));
                }
            }
        } else {
            title.textContent = `Seat ${index + 1}`;
            if (isMeHost && index !== 0) {
                if(isLocked) container.appendChild(this.createBtn("Unlock Seat", "primary-btn", () => webrtc.hostCommand('unlock_seat', null, index)));
                else container.appendChild(this.createBtn("Lock Seat", "danger-btn", () => webrtc.hostCommand('lock_seat', null, index)));
            }
            if (!occupant && !isLocked && !webrtc.amIOnSeat()) {
                container.appendChild(this.createBtn("Take Seat", "primary-btn", () => webrtc.requestSeat(index)));
            } else if (isLocked && !isMeHost) {
                title.textContent = "Seat is Locked by Admin";
            }
        }

        if(container.innerHTML !== "") modal.classList.remove('hidden');
    },

    handleAudienceClick(user) {
        if(user.deviceId === this.user.deviceId) return;
        const modal = document.getElementById('modal-seat-action');
        const title = document.getElementById('action-target-name');
        const container = document.getElementById('action-buttons-container');
        container.innerHTML = "";

        title.textContent = user.username;
        if(webrtc.isHost) {
            container.appendChild(this.createBtn("Remove from Room", "danger-btn", () => webrtc.hostCommand('kick_room', user.deviceId)));
        } else {
            container.appendChild(this.createBtn("Report User", "danger-btn", () => this.openReportModal(user.username, user.deviceId)));
        }
        modal.classList.remove('hidden');
    },

    createBtn(text, className, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.className = className;
        btn.onclick = () => {
            onClick();
            document.getElementById('modal-seat-action').classList.add('hidden');
        };
        return btn;
    },

    // OPEN REPORT MODAL & SET TARGET DATA
    openReportModal(username, deviceId) {
        this.reportTarget.username = username;
        this.reportTarget.deviceId = deviceId;
        
        document.getElementById('report-target-info').textContent = `Target: ${username}`;
        document.getElementById('modal-report').classList.remove('hidden');
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
    }
};

document.addEventListener('ConfigLoaded', () => app.init());
