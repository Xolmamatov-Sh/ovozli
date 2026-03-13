class VoiceAssistant {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.apiUrl = 'https://ovozli.onrender.com/api/stt';
        this.ttsUrl = 'https://ovozli.onrender.com/api/tts';
        this.testUrl = 'https://ovozli.onrender.com/api/test';
        this.voiceSetUrl = 'https://ovozli.onrender.com/api/voice/set';
        
        // Ovoz sozlamalari
        this.currentVoice = 'male';
        this.audioPlayer = new Audio();
        
        this.initElements();
        this.initEventListeners();
        this.loadHistory();
        this.testConnection();
    }

    async testConnection() {
        try {
            const response = await fetch(this.testUrl);
            const data = await response.json();
            console.log('✅ Backend ulandi:', data);
            console.log(`🎤 Hozirgi ovoz: ${data.current_voice}`);
            this.showNotification(`Backendga ulandi: ${data.current_voice} ovozi`, 'success');
        } catch (error) {
            console.error('❌ Backend xatosi:', error);
            this.showNotification('Backend server ishga tushmagan!', 'error');
        }
    }

    async setVoice(voiceType) {
        try {
            const response = await fetch(this.voiceSetUrl, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({voice: voiceType})
            });
            const data = await response.json();
            if (data.success) {
                this.currentVoice = voiceType;
                this.showNotification(data.message, 'success');
                console.log('✅ Ovoz o\'zgartirildi:', data.current_voice);
            }
        } catch (error) {
            console.error('❌ Ovoz o\'zgartirish xatosi:', error);
        }
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#4CAF50' : '#f44336'};
            color: white;
            border-radius: 5px;
            z-index: 1000;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    initElements() {
        this.recordBtn = document.getElementById('recordBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.waveAnimation = document.getElementById('waveAnimation');
        this.commandDisplay = document.getElementById('commandDisplay');
        this.responseDisplay = document.getElementById('responseDisplay');
        this.historyList = document.getElementById('historyList');
        this.actionSelect = document.getElementById('actionSelect');
        this.musicPlayer = document.getElementById('musicPlayer');
        this.voiceSelect = document.getElementById('voiceSelect');
        
        this.addVoiceSelector();
    }

    addVoiceSelector() {
        const voiceSelector = document.createElement('div');
        voiceSelector.className = 'voice-selector';
        voiceSelector.innerHTML = `
            <select id="voiceSelect" class="voice-select">
                <option value="male" selected>👨 Asomiddin (Erkak ovozi)</option>
                <option value="female">👩 Maftuna (Ayol ovozi)</option>
            </select>
        `;
        
        this.actionSelect.parentNode.insertBefore(voiceSelector, this.actionSelect.nextSibling);
        
        this.voiceSelect = document.getElementById('voiceSelect');
        this.voiceSelect.addEventListener('change', (e) => {
            this.setVoice(e.target.value);
        });
    }

    initEventListeners() {
        this.recordBtn.addEventListener('click', () => this.toggleRecording());
        
        document.querySelectorAll('.cmd-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cmd = e.currentTarget.dataset.cmd;
                this.processLocalCommand(cmd);
            });
        });
    }

    async toggleRecording() {
        if (!this.isRecording) {
            await this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    async startRecording() {
        try {
            console.log('Mikrofon so\'ralmoqda...');
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });
            
            console.log('✅ Mikrofon ruxsati olindi');
            
            const options = { 
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            };
            
            try {
                this.mediaRecorder = new MediaRecorder(stream, options);
            } catch (e) {
                this.mediaRecorder = new MediaRecorder(stream);
            }
            
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.sendAudioToServer();
            };

            this.mediaRecorder.start(1000);
            this.isRecording = true;
            
            this.recordBtn.innerHTML = '<i class="fas fa-stop"></i> To\'xtatish';
            this.recordBtn.classList.add('recording');
            this.statusIndicator.classList.add('listening');
            this.statusIndicator.innerHTML = '<i class="fas fa-microphone"></i>';
            this.waveAnimation.classList.add('active');
            this.commandDisplay.innerHTML = '<p>Tinglanmoqda... Gapiring</p>';
            
            setTimeout(() => {
                if (this.isRecording) {
                    this.stopRecording();
                }
            }, 10000);
            
        } catch (error) {
            console.error('❌ Mikrofon xatosi:', error);
            alert('Mikrofonga ulanishda xatolik!');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            
            if (this.mediaRecorder.stream) {
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
            
            this.isRecording = false;
            
            this.recordBtn.innerHTML = '<i class="fas fa-microphone"></i> Boshlash';
            this.recordBtn.classList.remove('recording');
            this.statusIndicator.classList.remove('listening');
            this.statusIndicator.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            this.waveAnimation.classList.remove('active');
        }
    }

    async sendAudioToServer() {
        if (this.audioChunks.length === 0) {
            alert('Audio yozilmadi!');
            return;
        }

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        if (audioBlob.size < 1000) {
            alert('Audio juda qisqa!');
            return;
        }

        const formData = new FormData();
        formData.append('audio', audioBlob, `recording_${Date.now()}.webm`);

        try {
            this.commandDisplay.innerHTML = '<p>Matnga aylantirilmoqda...</p>';
            
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            console.log('Server javobi:', data);
            
            let command = '';
            if (data.text) {
                command = data.text.toLowerCase();
            }
            
            if (command) {
                this.commandDisplay.innerHTML = `<p><strong>Siz:</strong> ${command}</p>`;
                this.addToHistory(command, 'user');
                await this.processCommand(command);
            }
            
        } catch (error) {
            console.error('❌ Xatolik:', error);
        }
    }

    processLocalCommand(cmd) {
        const commands = {
            'time': 'soat nechi',
            'music': 'musiqa qo\'y',
            'search': 'google da qidir',
            'date': 'bugun qanaqa sana',
            'weather': 'ob havo',
            'news': 'yangiliklar',
            'joke': 'hazil ayt',
            'quote': 'motivatsiya',
            'math': 'hisobla',
            'translate': 'tarjima qil',
            'timeWorld': 'dunyo vaqti',
            'currency': 'valyuta kursi',
            'timer': 'taymer',
            'alarm': 'budilnik',
            'note': 'eslatma',
            'reminder': 'eslatma qo\'sh',
            'weatherTomorrow': 'ertaga ob havo',
            'football': 'futbol natijalari',
            'movie': 'kino tavsiya',
            'recipe': 'ovqat retsepti'
        };
        
        const command = commands[cmd] || cmd;
        this.commandDisplay.innerHTML = `<p><strong>Siz:</strong> ${command}</p>`;
        this.addToHistory(command, 'user');
        this.processCommand(command);
    }

    async processCommand(command) {
        let response = '';
        
        console.log('Buyruq:', command);
        
        // 1. VAQT
        if (command.includes('soat') || command.includes('vaqt') || command.includes('time')) {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            response = `Hozir soat ${hours}:${minutes}:${seconds}`;
        }
        
        // 2. SANA
        else if (command.includes('sana') || command.includes('bugun') || command.includes('date')) {
            const now = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const dateStr = now.toLocaleDateString('uz-UZ', options);
            response = `Bugun ${dateStr}`;
        }
        
        // 3. MUSIQA
        else if (command.includes('musiqa') || command.includes('qo\'y') || command.includes('music')) {
            response = 'Musiqa ijro etilmoqda...';
            this.playMusic();
        }
        
        // 4. QIDIRUV
        else if (command.includes('qidir') || command.includes('google') || command.includes('search')) {
            const searchTerm = command
                .replace('qidir', '')
                .replace('google', '')
                .replace('da', '')
                .replace('qidiruv', '')
                .trim();
            
            if (searchTerm) {
                response = `"${searchTerm}" bo'yicha qidirilmoqda...`;
                window.open(`https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`, '_blank');
            } else {
                response = 'Nimani qidirish kerak? Masalan: "google da ob-havo"';
            }
        }
        
        // 5. OB-HAVO
        else if (command.includes('ob-havo') || command.includes('ob havo') || command.includes('weather')) {
            response = 'Toshkentda havo ochiq, harorat +25°C. Bugun yog\'ingarchilik kutilmaydi.';
        }
        
        // 6. YANGILIKLAR
        else if (command.includes('yangilik') || command.includes('news') || command.includes('xabar')) {
            response = 'Bugungi asosiy yangiliklar: Prezident yangi farmon imzoladi, valyuta kursi o\'zgardi, sportda g\'alabalar.';
        }
        
        // 7. HAZIL
        else if (command.includes('hazil') || command.includes('joke') || command.includes('kulgi')) {
            const jokes = [
                'Kompyuterning xotirasi yaxshi, lekin uni o\'chirib qo\'ysangiz hamma narsani unutadi!',
                'Nima uchun dasturchilar doima sovuq joyda ishlaydi? Chunki ular uchun "Windows" yetarli emas!',
                'Ikki dasturchi uchrashibdi: "Ishlaring yaxshimi?" - "Juda yaxshi, hatto xatolar ham kam!"',
                'Agar siz xonada yolg\'iz bo\'lsangiz va hech kim ko\'rmasa, hali bu sizning kodingiz ishlaydi degani emas!'
            ];
            response = jokes[Math.floor(Math.random() * jokes.length)];
        }
        
        // 8. MOTIVATSIYA
        else if (command.includes('motivatsiya') || command.includes('quote') || command.includes('maslahat')) {
            const quotes = [
                'Muvaffaqiyatga erishish uchun birinchi qadamni qo\'yish kifoya.',
                'Bugun qilishingiz mumkin bo\'lgan ishni ertaga qoldirmang.',
                'Kuchli bo\'lish uchun avval o\'zingizga ishoning.',
                'Har bir kun yangi imkoniyatdir.'
            ];
            response = quotes[Math.floor(Math.random() * quotes.length)];
        }
        
        // 9. HISOBLASH
        else if (command.includes('hisobla') || command.includes('math') || command.includes('hisoblash')) {
            if (command.includes('2+2')) response = '2+2 = 4';
            else if (command.includes('5*5')) response = '5*5 = 25';
            else if (command.includes('10/2')) response = '10/2 = 5';
            else response = 'Hisoblash uchun misol kiriting. Masalan: "2+2 nechi?"';
        }
        
        // 10. TARJIMA
        else if (command.includes('tarjima') || command.includes('translate')) {
            response = 'Tarjima qilish uchun "google translate" dan foydalaning. Men hozircha tarjima qila olmayman.';
        }
        
        // 11. DUNYO VAQTI
        else if (command.includes('dunyo vaqti') || command.includes('timeWorld')) {
            const times = {
                'Tokyo': new Date().toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Tokyo' }),
                'London': new Date().toLocaleTimeString('uz-UZ', { timeZone: 'Europe/London' }),
                'New York': new Date().toLocaleTimeString('uz-UZ', { timeZone: 'America/New_York' }),
                'Moscow': new Date().toLocaleTimeString('uz-UZ', { timeZone: 'Europe/Moscow' })
            };
            response = `Dunyo vaqti: Tokio ${times.Tokyo}, London ${times.London}, Nyu-York ${times['New York']}`;
        }
        
        // 12. VALYUTA KURSI
        else if (command.includes('valyuta') || command.includes('dollar') || command.includes('currency')) {
            response = 'Bugungi valyuta kurslari: 1 USD = 12,500 so\'m, 1 EUR = 13,500 so\'m';
        }
        
        // 13. TAYMER
        else if (command.includes('taymer') || command.includes('timer')) {
            response = 'Taymer o\'rnatish uchun "5 daqiqaga taymer" deb ayting';
        }
        
        // 14. BUDILNIK
        else if (command.includes('budilnik') || command.includes('alarm')) {
            response = 'Budilnik o\'rnatish uchun "ertalab 7 ga budilnik" deb ayting';
        }
        
        // 15. ESLATMA
        else if (command.includes('eslatma') || command.includes('note') || command.includes('reminder')) {
            const note = command.replace('eslatma', '').replace('note', '').replace('reminder', '').trim();
            if (note) {
                response = `"${note}" eslatmasi saqlandi`;
                localStorage.setItem('lastNote', note);
            } else {
                response = 'Nima haqida eslatma qoldiray?';
            }
        }
        
        // 16. ERTAGA OB-HAVO
        else if (command.includes('ertaga ob-havo') || command.includes('weatherTomorrow')) {
            response = 'Ertaga Toshkentda havo ochiq, harorat +27°C bo\'lishi kutilmoqda.';
        }
        
        // 17. FUTBOL NATIJALARI
        else if (command.includes('futbol') || command.includes('football') || command.includes('sport')) {
            response = 'Oxirgi futbol natijalari: "Barselona" 3-1 "Real", "Manchester City" 2-0 "Chelsea"';
        }
        
        // 18. KINO TAVSIYA
        else if (command.includes('kino') || command.includes('film') || command.includes('movie')) {
            const movies = [
                'Inception - ajoyib film, ko\'rishni tavsiya qilaman',
                'The Matrix - klassika, albatta ko\'ring',
                'Interstellar - koinot haqida ajoyib film',
                'Shawshank Redemption - eng yaxshi filmlardan biri'
            ];
            response = movies[Math.floor(Math.random() * movies.length)];
        }
        
        // 19. OVQAT RETSEPTI
        else if (command.includes('retsept') || command.includes('ovqat') || command.includes('recipe')) {
            const recipes = [
                'Palov: guruch, go\'sht, sabzi va piyoz kerak. Avval go\'shtni qovuring...',
                'Manti: go\'sht, piyoz, ziravorlar. Xamir yoyib, ichiga solinadi...',
                'Shashlik: go\'shtni sirka va ziravorlarda 2 soat saqlang, so\'ng pishiring'
            ];
            response = recipes[Math.floor(Math.random() * recipes.length)];
        }
        
        // 20. KUN HIKMATI
        else if (command.includes('kun hikmati') || command.includes('wisdom')) {
            response = 'Bugungi kun hikmati: "Bilim - eng katta boylik, u hech qachon tugamaydi"';
        }
        
        // 21. SALOMLASHISH
        else if (command.includes('salom') || command.includes('assalom') || command.includes('hello')) {
            response = 'Assalomu alaykum! Sizga qanday yordam bera olaman?';
        }
        
        // 22. RAHMAT
        else if (command.includes('rahmat') || command.includes('thanks') || command.includes('thank')) {
            response = 'Arzimaydi! Doim tayyorman. Yana qanday yordam kerak?';
        }
        
        // 23. XAYRLASHISH
        else if (command.includes('xayr') || command.includes('goodbye') || command.includes('bye')) {
            response = 'Xayr! Yana ko\'rishguncha.';
        }
        
        // 24. YORDAM
        else if (command.includes('yordam') || command.includes('help') || command.includes('qanday')) {
            response = 'Men quyidagi buyruqlarni tushunaman: soat nechi, bugun qanaqa sana, musiqa qo\'y, google da qidir, ob-havo, yangiliklar, hazil ayt, motivatsiya, hisobla, valyuta kursi, futbol natijalari, kino tavsiya va boshqalar.';
        }
        
        // NOMA'LUM BUYRUK
        else {
            response = 'Kechirasiz, men bu buyruqni tushunmadim. Yordam uchun "yordam" yoki "help" deb so\'rang.';
        }

        this.responseDisplay.innerHTML = `<p><strong>Muxlisa:</strong> ${response}</p>`;
        this.addToHistory(response, 'assistant');
        
        await this.speakWithMuxlisa(response);
    }

    async speakWithMuxlisa(text) {
        try {
            console.log(`🔊 TTS: ${text} (Ovoz: ${this.currentVoice})`);
            
            const response = await fetch(this.ttsUrl, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text: text})
            });

            if (response.ok) {
                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                
                const audio = new Audio(audioUrl);
                audio.play();
                
                console.log('✅ TTS ijro etilmoqda');
            } else {
                console.error('❌ TTS xatosi');
            }
        } catch (error) {
            console.error('❌ TTS xatosi:', error);
        }
    }

    playMusic() {
        this.musicPlayer.classList.remove('hidden');
        
        const musicUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
        this.audioPlayer.src = musicUrl;
        this.audioPlayer.play().catch(e => console.log('Musiqa xatosi:', e));
    }

    addToHistory(text, type) {
        const li = document.createElement('li');
        const time = new Date().toLocaleTimeString('uz-UZ', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        li.innerHTML = `
            <i class="fas fa-${type === 'user' ? 'user' : 'robot'}"></i>
            <span>${text}</span>
            <small>${time}</small>
        `;
        
        this.historyList.insertBefore(li, this.historyList.firstChild);
        this.saveHistory();
    }

    saveHistory() {
        const historyItems = [];
        document.querySelectorAll('#historyList li').forEach(li => {
            historyItems.push(li.innerHTML);
        });
        localStorage.setItem('commandHistory', JSON.stringify(historyItems.slice(0, 20)));
    }

    loadHistory() {
        const history = JSON.parse(localStorage.getItem('commandHistory') || '[]');
        history.reverse().forEach(html => {
            const li = document.createElement('li');
            li.innerHTML = html;
            this.historyList.appendChild(li);
        });
    }
}

// Ilovani ishga tushirish
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 AI ishga tushmoqda...');
    new VoiceAssistant();
});
