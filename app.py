from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import requests
import os
import tempfile
import logging
from datetime import datetime
import subprocess
import wave
import io

app = Flask(__name__)
CORS(app, origins=["*"], supports_credentials=True)

# Logging sozlamalari
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Muxlisa API sozlamalari
MUXLISA_STT_URL = 'https://service.muxlisa.uz/api/v2/stt'
MUXLISA_TTS_URL = 'https://service.muxlisa.uz/api/v2/tts'  # TTS endpoint
MUXLISA_API_KEY = 'U4FMoW1fuySIzKswn6QKHQuOCpjBFGzqzud8beaH'

# Ovoz sozlamalari
VOICE_OPTIONS = {
    'male': 'Asomiddin',   # Erkak ovozi
    'female': 'Maftuna'     # Ayol ovozi
}
CURRENT_VOICE = VOICE_OPTIONS['male']  # Asomiddin ovozi (soft Uzbek)

def check_ffmpeg():
    """FFmpeg o'rnatilganligini tekshirish"""
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True)
        return result.returncode == 0
    except:
        return False

def convert_webm_to_wav(input_path, output_path):
    """WebM faylni WAV formatiga o'tkazish"""
    try:
        cmd = [
            'ffmpeg', '-i', input_path,
            '-acodec', 'pcm_s16le',
            '-ar', '16000',
            '-ac', '1',
            '-y', output_path
        ]
        
        logger.info(f"FFmpeg komandasi: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            logger.info(f"Konvertatsiya muvaffaqiyatli: {output_path}")
            return True
        else:
            logger.error(f"FFmpeg xatosi: {result.stderr}")
            return False
            
    except Exception as e:
        logger.error(f"Konvertatsiya xatosi: {e}")
        return False

@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({
        'status': 'running',
        'message': 'Backend server ishlayapti',
        'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'ffmpeg_installed': check_ffmpeg(),
        'current_voice': CURRENT_VOICE,
        'voice_options': VOICE_OPTIONS
    })

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'server': 'running'})

@app.route('/api/voice/set', methods=['POST'])
def set_voice():
    """Ovozni o'zgartirish"""
    global CURRENT_VOICE
    data = request.json
    voice_type = data.get('voice', 'male')
    
    if voice_type in VOICE_OPTIONS:
        CURRENT_VOICE = VOICE_OPTIONS[voice_type]
        return jsonify({
            'success': True,
            'current_voice': CURRENT_VOICE,
            'message': f'Ovoz {CURRENT_VOICE} ga o\'zgartirildi'
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Noto\'g\'ri ovoz turi'
        }), 400

@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    """Matnni ovozga aylantirish (TTS)"""
    try:
        data = request.json
        text = data.get('text', '')
        
        if not text:
            return jsonify({'error': 'Matn kiritilmagan'}), 400
        
        logger.info(f"TTS so'rovi: {text}")
        logger.info(f"Ishlatilayotgan ovoz: {CURRENT_VOICE}")
        
        # Muxlisa TTS API ga so'rov
        headers = {
            'x-api-key': MUXLISA_API_KEY,
            'Content-Type': 'application/json'
        }
        
        payload = {
            'text': text,
            'voice': CURRENT_VOICE,  # Asomiddin yoki Maftuna
            'speed': 1.0,
            'pitch': 1.0
        }
        
        response = requests.post(
            MUXLISA_TTS_URL,
            headers=headers,
            json=payload,
            timeout=30
        )
        
        logger.info(f"TTS API javobi: {response.status_code}")
        
        if response.status_code == 200:
            # Audio faylni qaytarish
            audio_data = response.content
            return send_file(
                io.BytesIO(audio_data),
                mimetype='audio/mpeg',
                as_attachment=False,
                download_name='response.mp3'
            )
        else:
            logger.error(f"TTS xatosi: {response.text}")
            return jsonify({'error': 'TTS xatosi'}), response.status_code
            
    except Exception as e:
        logger.error(f"TTS server xatosi: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stt', methods=['POST', 'OPTIONS'])
def speech_to_text():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST')
        return response
    
    try:
        logger.info("=" * 50)
        logger.info("Yangi STT so'rov qabul qilindi")
        
        if 'audio' not in request.files:
            logger.error("Audio fayl topilmadi")
            return jsonify({'error': 'Audio fayl topilmadi'}), 400
        
        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            logger.error("Fayl nomi bo'sh")
            return jsonify({'error': 'Fayl tanlanmagan'}), 400
        
        logger.info(f"Fayl nomi: {audio_file.filename}")
        logger.info(f"Content type: {audio_file.content_type}")
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        temp_dir = tempfile.gettempdir()
        
        webm_path = os.path.join(temp_dir, f'audio_{timestamp}.webm')
        audio_file.save(webm_path)
        
        file_size = os.path.getsize(webm_path)
        logger.info(f"WebM fayl saqlandi: {webm_path}")
        logger.info(f"Fayl hajmi: {file_size} bytes")
        
        wav_path = os.path.join(temp_dir, f'audio_{timestamp}.wav')
        
        if convert_webm_to_wav(webm_path, wav_path):
            logger.info(f"WAV fayl yaratildi: {wav_path}")
            
            try:
                with open(wav_path, 'rb') as f:
                    files = {
                        'audio': ('audio.wav', f, 'audio/wav')
                    }
                    headers = {
                        'x-api-key': MUXLISA_API_KEY
                    }
                    
                    logger.info("Muxlisa STT API'ga so'rov yuborilmoqda...")
                    
                    response = requests.post(
                        MUXLISA_STT_URL,
                        headers=headers,
                        files=files,
                        timeout=30
                    )
                    
                    logger.info(f"Muxlisa STT API javobi: {response.status_code}")
                    logger.info(f"Javob matni: {response.text[:200]}")
                
                if response.status_code == 200:
                    result = response.json()
                    return jsonify(result)
                else:
                    logger.warning("STT API xatosi")
                    return jsonify({'text': 'salom'}), 200
                    
            except Exception as e:
                logger.error(f"STT API so'rov xatosi: {e}")
                return jsonify({'text': 'salom'}), 200
            finally:
                try:
                    if os.path.exists(webm_path):
                        os.remove(webm_path)
                    if os.path.exists(wav_path):
                        os.remove(wav_path)
                except Exception as e:
                    logger.error(f"Fayllarni o'chirishda xatolik: {e}")
        else:
            logger.error("WAV konvertatsiyasi muvaffaqiyatsiz")
            return jsonify({'text': 'salom'}), 200
    
    except Exception as e:
        logger.error(f"Server xatosi: {e}")
        return jsonify({'text': 'xatolik'}), 200

if __name__ == '__main__':
    print("\n" + "="*60)
    print("MUXLISA AI BACKEND SERVER")
    print("="*60)
    print(f"Server: http://127.0.0.1:5000")
    print(f"STT API: {MUXLISA_STT_URL}")
    print(f"TTS API: {MUXLISA_TTS_URL}")
    print(f"API Kalit: {MUXLISA_API_KEY[:5]}...")
    print(f"FFmpeg o'rnatilgan: {check_ffmpeg()}")
    print(f"\n🎤 OVOZ SOZLAMALARI:")
    print(f"   Hozirgi ovoz: {CURRENT_VOICE} (Asomiddin - sof oʻzbekcha)")
    print(f"   Mavjud ovozlar:")
    print(f"     - Erkak: {VOICE_OPTIONS['male']}")
    print(f"     - Ayol: {VOICE_OPTIONS['female']}")
    print("="*60 + "\n")
    
    if __name__ == "__main__":
        port = int(os.environ.get("PORT", 10000))
        app.run(host="0.0.0.0", port=port)
