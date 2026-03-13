import requests

# Backend test
def test_backend():
    url = "http://127.0.0.1:5000/api/test"
    response = requests.get(url)
    print("Backend test:", response.json())

# To'g'ridan-to'g'ri Muxlisa API test
def test_muxlisa_api():
    url = "https://service.muxlisa.uz/api/v2/stt"
    headers = {
        'x-api-key': 'U4FMoW1fuySIzKswn6QKHQuOCpjBFGzqzud8beaH'  # Sizning API kalitingiz
    }
    
    # Test audio fayl yaratish (agar bo'lmasa)
    files = {
        'audio': ('test.wav', open('test.wav', 'rb'), 'audio/wav')
    }
    
    try:
        response = requests.post(url, headers=headers, files=files)
        print("Muxlisa API test:", response.status_code)
        print(response.text)
    except Exception as e:
        print("Xatolik:", e)

if __name__ == "__main__":
    test_backend()
    # test_muxlisa_api()