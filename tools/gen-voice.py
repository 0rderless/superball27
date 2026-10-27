"""Records the commentary clips with Kokoro (open-source TTS, Apache-2.0) into assets/voice/.

  node tools/voice-list.mjs > clips.json
  python tools/gen-voice.py clips.json <model-dir>     # model-dir holds kokoro-v1.0.onnx + voices-v1.0.bin

Needs: pip install kokoro-onnx soundfile, and ffmpeg. Model files: github.com/thewh1teagle/kokoro-onnx releases.
"""
import json, os, subprocess, sys, tempfile
import soundfile as sf
from kokoro_onnx import Kokoro

VOICES = {'lead': 'bm_george', 'co': 'bm_fable'}
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'voice')

def main(clips_path, model_dir):
    clips = json.load(open(clips_path))
    k = Kokoro(os.path.join(model_dir, 'kokoro-v1.0.onnx'), os.path.join(model_dir, 'voices-v1.0.bin'))
    os.makedirs(OUT, exist_ok=True)
    for i, c in enumerate(clips):
        dst = os.path.join(OUT, c['file'])
        if os.path.exists(dst):
            continue
        excited = c['mood'] == 'excited'
        audio, sr = k.create(c['text'], voice=VOICES[c['voice']], speed=1.12 if excited else 1.02, lang='en-gb')
        with tempfile.NamedTemporaryFile(suffix='.wav') as w:
            sf.write(w.name, audio, sr)
            # trim the silence at both ends so clips chain tightly; excited lines a touch higher and louder
            pitch = 'asetrate={0}*1.05,aresample={0},atempo=0.9524,'.format(sr) if excited else ''
            flt = (pitch + 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
                   'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
                   + ('volume=1.25,' if excited else '') + 'alimiter=limit=0.95')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w.name, '-af', flt, '-ac', '1', '-ar', '24000',
                            '-c:a', 'libmp3lame', '-b:a', '48k', dst], check=True)
        if i % 50 == 0:
            print(f'{i}/{len(clips)}', flush=True)
    print('done', len(clips))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
