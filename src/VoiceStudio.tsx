import { useRef, useState } from 'react';
import { AudioLines, ArrowRight, Upload, Download, ShieldCheck, Scissors, Check, LoaderCircle } from 'lucide-react';
import './voice.css';

function wav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels, length = buffer.length * channels * 2;
  const bytes = new ArrayBuffer(44 + length), view = new DataView(bytes);
  const word = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, 36 + length, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, length, true);
  const samples = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
    const s = Math.max(-1, Math.min(1, samples[c][i])); view.setInt16(offset, Math.round(s * (s < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
export default function VoiceStudio() {
  const input = useRef<HTMLInputElement>(null), context = useRef<AudioContext | null>(null);
  const originalURL = useRef(''), outputURL = useRef('');
  const [file, setFile] = useState<File | null>(null), [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [threshold, setThreshold] = useState(-38), [pause, setPause] = useState(200), [minimum, setMinimum] = useState(500);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<{ url: string; seconds: number; gaps: number } | null>(null);
  async function load(selected?: File) {
    if (!selected || busy) return;
    setBusy(true); setError(''); setResult(null); setBuffer(null); setFile(null);
    try {
      if (selected.size > 150 * 1024 * 1024) throw new Error('Please choose a recording smaller than 150 MB.');
      context.current ??= new AudioContext();
      const decoded = await context.current.decodeAudioData(await selected.arrayBuffer());
      URL.revokeObjectURL(originalURL.current); URL.revokeObjectURL(outputURL.current);
      originalURL.current = URL.createObjectURL(selected); setBuffer(decoded); setFile(selected);
    } catch (e) { setError(e instanceof Error ? e.message : 'This audio format could not be opened. Try WAV or MP3.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  async function clean() {
    if (!buffer || !context.current) return;
    setBusy(true); setError('');
    await new Promise(resolve => setTimeout(resolve, 30));
    try {
      const rate = buffer.sampleRate, step = Math.max(1, Math.round(rate * .01));
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      const limit = Math.pow(10, threshold / 20), cuts: [number, number][] = [];
      let start = -1;
      const finish = (end: number) => {
        if (start >= 0 && (end - start) / rate >= minimum / 1000) {
          const padding = Math.round(rate * pause / 2000);
          if (end - padding > start + padding) cuts.push([start + padding, end - padding]);
        }
        start = -1;
      };
      for (let i = 0; i < buffer.length; i += step) {
        const end = Math.min(i + step, buffer.length);
        let loudest = 0;
        for (const channel of channels) {
          let sum = 0; for (let j = i; j < end; j++) sum += channel[j] ** 2;
          loudest = Math.max(loudest, Math.sqrt(sum / (end - i)));
        }
        if (loudest < limit) { if (start < 0) start = i; } else finish(i);
      }
      finish(buffer.length);
      const length = buffer.length - cuts.reduce((sum, [a, b]) => sum + b - a, 0);
      const output = context.current.createBuffer(buffer.numberOfChannels, Math.max(1, length), rate);
      channels.forEach((channel, c) => {
        const target = output.getChannelData(c); let source = 0, dest = 0;
        for (const [a, b] of cuts) {
          target.set(channel.subarray(source, a), dest); dest += a - source;
          // Short fades soften the splice without changing speech timing.
          const fade = Math.min(Math.round(rate * .003), a - source, buffer.length - b);
          for (let j = 0; j < fade; j++) target[dest - fade + j] *= (fade - j) / fade;
          source = b;
        }
        target.set(channel.subarray(source), dest);
      });
      URL.revokeObjectURL(outputURL.current); outputURL.current = URL.createObjectURL(wav(output));
      setResult({ url: outputURL.current, seconds: output.duration, gaps: cuts.length });
    } catch { setError('Could not process this recording. Try a shorter file.'); }
    finally { setBusy(false); }
  }
  return <div className="studio"><header><a className="brand" href="#"><span className="brand-icon"><AudioLines size={23}/></span>hush<span className="brand-dot">.</span></a><span className="header-note">A little less silence. A lot more flow.</span><span className="local-badge"><ShieldCheck size={14}/> 100% private</span></header>
    <main><div className="eyebrow"><span/> MADE FOR YOUR VOICE</div><h1>Great voiceovers.<br/><span>Without the gaps.</span></h1><p className="intro">Turn long pauses into a smooth, natural flow.<br/>Drop your recording. Let us take care of the quiet parts.</p>
    <div className="workspace"><section className="editor"><div className="section-label"><span className="step">01</span> YOUR RECORDING <span className="format">WAV, MP3, M4A & more</span></div>
      <input ref={input} type="file" accept="audio/*,.m4a,.wav,.mp3,.ogg,.flac" hidden onChange={e => load(e.target.files?.[0])}/>
      <button className={`dropzone ${file ? 'loaded' : ''}`} disabled={busy} onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>
      <span className="upload-icon">{busy && !buffer ? <LoaderCircle className="spin"/> : file ? <AudioLines/> : <Upload/>}</span><strong>{file ? file.name : 'Drop your audio here'}</strong><span>{file ? `${duration(buffer?.duration || 0)} · ${(file.size / 1024 / 1024).toFixed(1)} MB · Click to replace` : <>or <b>browse files</b> to get started</>}</span><small>{file ? 'Your recording is ready for a little magic.' : 'Up to 150 MB · Your files never leave this device'}</small></button>
      {buffer && <div className="original"><span>ORIGINAL RECORDING</span><audio controls src={originalURL.current}/></div>}
      <div className="section-label settings-label"><span className="step">02</span> MAKE IT SOUND LIKE YOU <span className="tune">Fine-tune your flow</span></div>
      <div className="setting"><div><label htmlFor="threshold">Silence threshold</label><p>Anything quieter than this counts as silence.</p></div><output>{threshold} dB</output></div><input id="threshold" type="range" min="-60" max="-20" value={threshold} onChange={e => { setThreshold(+e.target.value); setResult(null); }}/><div className="range-hints"><span>Keep softer sounds</span><span>Remove more noise</span></div>
      <div className="setting"><div><label htmlFor="pause">Keep a little breathing room</label><p>A short pause between phrases feels natural.</p></div><output>{pause} ms</output></div><input id="pause" type="range" min="0" max="500" step="50" value={pause} onChange={e => {setPause(+e.target.value); setResult(null);}}/><div className="range-hints"><span>Tight & quick</span><span>Relaxed & natural</span></div>
      <div className="minimum"><label htmlFor="minimum">Only shorten pauses longer than</label><select id="minimum" value={minimum} onChange={e => {setMinimum(+e.target.value); setResult(null);}}><option value="300">0.3 seconds</option><option value="500">0.5 seconds</option><option value="750">0.75 seconds</option><option value="1000">1 second</option></select></div>
      <button className="process" disabled={!buffer || busy} onClick={clean}>{busy ? <LoaderCircle className="spin" size={18}/> : <Scissors size={18}/>} {busy ? 'Working on your recording…' : 'Remove silent gaps'}<ArrowRight size={18}/></button>{error && <p role="alert" className="error">{error}</p>}
      {result && <div className="result" aria-live="polite"><div><Check size={18}/><strong>Your voice, with a better flow.</strong></div><p>{result.gaps} gaps shortened · {duration((buffer?.duration || 0) - result.seconds)} removed · {duration(result.seconds)} final length</p><audio controls src={result.url}/><a className="download" href={result.url} download={`${file?.name.replace(/\.[^.]+$/, '') || 'recording'}-cleaned.wav`}><Download size={17}/> Download cleaned WAV</a><small>Listen before downloading. Lower the threshold if quiet words are cut.</small></div>}
    </section><aside><div className="preview-label"><span className="tiny-dot"/> LESS SILENCE. MORE YOU.</div><div className="wave-block"><span>BEFORE</span><div className="wave before">{Array.from({length:51},(_,i)=><i key={i} style={{height: `${(i > 12 && i < 24) || (i > 35 && i < 43) ? 3 : 12 + Math.abs(Math.sin(i * 2.1)) * 45}px`}}/>)}</div><div className="gap-mark">those awkward pauses</div></div><div className="wave-block after-block"><span>AFTER</span><div className="wave after">{Array.from({length:51},(_,i)=><i key={i} style={{height: `${i%17===0 ? 4 : 10 + Math.abs(Math.sin(i * 1.7)) * 46}px`}}/>)}</div></div><div className="aside-copy"><h2>Keep the voice.<br/>Lose the waiting.</h2><p>Perfect for podcasts, tutorials, voiceovers, and that recording you really don’t want to edit by hand.</p></div><ul><li><Check/> Natural pauses, preserved</li><li><Check/> Original recording, untouched</li><li><Check/> No uploads. No accounts. No fuss.</li></ul><div className="tip"><span>✦ A SMALL TIP</span><p>Start with the defaults. Preview your result, then adjust until it sounds just right.</p></div></aside></div>
    <div className="privacy"><ShieldCheck size={16}/><span>Just between you and your browser. All audio processing happens on your device.</span></div></main><footer><span>hush. <span className="footer-muted">Made for a smoother story.</span></span><span>A quiet little tool for big ideas.</span></footer></div>;
}
