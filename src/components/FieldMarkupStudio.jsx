import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Undo2, RotateCcw, Save, MousePointer2, Type, Square, Circle as CircleIcon, ArrowUpRight, PenTool, Brush } from 'lucide-react';

export default function FieldMarkupStudio({ image, onSave, onClose }) {
    const canvasRef = useRef(null);
    const contextRef = useRef(null);
    const historyRef = useRef([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('#ef4444');
    const [thickness, setThickness] = useState(6);
    const [tool, setTool] = useState('pen'); // pen, arrow, rect, circle, text, select
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [textInput, setTextInput] = useState({ show: false, x: 0, y: 0, value: '' });
    const [loading, setLoading] = useState(true);
    const inputRef = useRef(null);

    // Track state for reset and preview
    const initialImageDataRef = useRef(null);
    const previewBaseStateRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        contextRef.current = ctx;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = typeof image === 'string' ? image : URL.createObjectURL(image);
        img.onload = () => {
            const maxWidth = window.innerWidth * 0.95;
            const maxHeight = window.innerHeight * 0.8;
            let width = img.width;
            let height = img.height;

            const scale = Math.min(maxWidth / width, maxHeight / height, 1);
            canvas.width = Math.floor(width * scale);
            canvas.height = Math.floor(height * scale);

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            initialImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
            saveToHistory();
            setLoading(false);
        };
    }, [image]);

    const saveToHistory = useCallback(() => {
        const ctx = contextRef.current;
        if (!ctx) return;
        const data = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        const newHistory = historyRef.current.slice(0, historyIndex + 1);
        newHistory.push(data);
        if (newHistory.length > 25) newHistory.shift();
        historyRef.current = newHistory;
        setHistoryIndex(newHistory.length - 1);
    }, [historyIndex]);

    const undo = () => {
        if (historyIndex <= 0) return;
        const newIndex = historyIndex - 1;
        contextRef.current.putImageData(historyRef.current[newIndex], 0, 0);
        setHistoryIndex(newIndex);
    };

    const handleReset = () => {
        if (!initialImageDataRef.current) return;
        contextRef.current.putImageData(initialImageDataRef.current, 0, 0);
        historyRef.current = [initialImageDataRef.current];
        setHistoryIndex(0);
    };

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const startDrawing = (e) => {
        if (tool === 'select' || loading) return;
        const pos = getPos(e);
        if (tool === 'text') {
            setTextInput({ show: true, x: pos.x, y: pos.y, value: '' });
            return;
        }
        setIsDrawing(true);
        setStartPos(pos);
        previewBaseStateRef.current = contextRef.current.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        const ctx = contextRef.current;
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        if (e.cancelable) e.preventDefault();
        const pos = getPos(e);
        const ctx = contextRef.current;

        if (tool === 'pen') {
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        } else {
            ctx.putImageData(previewBaseStateRef.current, 0, 0);
            ctx.strokeStyle = color;
            ctx.lineWidth = thickness;
            if (tool === 'rect') {
                ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
            } else if (tool === 'circle') {
                const r = Math.sqrt(Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2));
                ctx.beginPath();
                ctx.arc(startPos.x, startPos.y, r, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (tool === 'arrow') {
                const head = thickness * 4;
                const angle = Math.atan2(pos.y - startPos.y, pos.x - startPos.x);
                ctx.beginPath();
                ctx.moveTo(startPos.x, startPos.y);
                ctx.lineTo(pos.x, pos.y);
                ctx.lineTo(pos.x - head * Math.cos(angle - Math.PI / 6), pos.y - head * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x - head * Math.cos(angle + Math.PI / 6), pos.y - head * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            }
        }
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        saveToHistory();
    };

    const finalizeText = () => {
        if (textInput.value.trim()) {
            const ctx = contextRef.current;
            const size = Math.max(20, thickness * 4);
            ctx.font = `bold ${size}px Inter, sans-serif`;
            ctx.fillStyle = color;
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.fillText(textInput.value, textInput.x, textInput.y);
            ctx.shadowBlur = 0;
            saveToHistory();
        }
        setTextInput({ show: false, x: 0, y: 0, value: '' });
    };

    const handleSave = () => {
        canvasRef.current.toBlob((blob) => {
            const name = image instanceof File ? image.name.replace(/\.[^.]+$/, '') : 'markup';
            onSave(new File([blob], `${name}-marked.png`, { type: 'image/png' }));
        }, 'image/png', 0.95);
    };

    return (
        <div 
            className="markup-studio-overlay" 
            onClick={(e) => e.stopPropagation()} 
            onPointerDown={(e) => e.stopPropagation()} 
            onPointerUp={(e) => e.stopPropagation()}
        >
            <header className="markup-studio-header">
                <div className="studio-title-group">
                    <div className="studio-icon-box"><PenTool size={20} color="white" /></div>
                    <div>
                        <h2 className="studio-title-main">Field Markup Studio</h2>
                        <span className="studio-title-sub">Professional Field Annotations</span>
                    </div>
                </div>
                <div className="studio-close-group">
                    <button className="studio-action-btn secondary" onClick={onClose}><X size={16} /> Cancel</button>
                    <button className="studio-action-btn" onClick={handleSave}><Save size={16} /> Save Changes</button>
                </div>
            </header>

            <div className="markup-context-bar">
                <div className="context-group">
                    <span className="context-label">Color</span>
                    <div className="studio-palette">
                        {['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#ffffff', '#000000'].map(c => (
                            <div key={c} className={`studio-color-dot ${color === c ? 'active' : ''}`} 
                                 style={{ background: c }} onClick={() => setColor(c)} />
                        ))}
                    </div>
                </div>
                <div className="context-group">
                    <span className="context-label">Size</span>
                    <input type="range" min="2" max="25" value={thickness} onChange={e => setThickness(Number(e.target.value))} className="studio-range" />
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', width: '20px' }}>{thickness}</span>
                </div>
                <div className="context-group" style={{ border: 'none' }}>
                    <span className="context-label">Tool:</span>
                    <span style={{ fontSize: '0.85rem', color: '#e2e8f0', textTransform: 'capitalize' }}>{tool}</span>
                </div>
            </div>

            <div className="markup-studio-content">
                <aside className="markup-studio-sidebar">
                    <button className={`studio-tool-btn ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')} data-label="Select"><MousePointer2 size={20} /></button>
                    <button className={`studio-tool-btn ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} data-label="Brush"><Brush size={20} /></button>
                    <button className={`studio-tool-btn ${tool === 'arrow' ? 'active' : ''}`} onClick={() => setTool('arrow')} data-label="Arrow"><ArrowUpRight size={22} /></button>
                    <button className={`studio-tool-btn ${tool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect')} data-label="Rectangle"><Square size={20} /></button>
                    <button className={`studio-tool-btn ${tool === 'circle' ? 'active' : ''}`} onClick={() => setTool('circle')} data-label="Circle"><CircleIcon size={20} /></button>
                    <button className={`studio-tool-btn ${tool === 'text' ? 'active' : ''}`} onClick={() => setTool('text')} data-label="Text"><Type size={20} /></button>
                    
                    <div className="sidebar-footer">
                        <button className="history-btn" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)"><Undo2 size={18} /></button>
                        <button className="history-btn" onClick={handleReset} title="Reset Image"><RotateCcw size={18} /></button>
                    </div>
                </aside>

                <main className="markup-canvas-viewport">
                    <div className="canvas-scroller">
                        <div style={{ position: 'relative' }}>
                            <canvas ref={canvasRef} className={`markup-main-canvas ${tool === 'select' ? 'select-mode' : ''}`}
                                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                                    onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                            
                            {tool === 'text' && textInput.show && (
                                <input ref={inputRef} type="text" autoFocus value={textInput.value} 
                                       onChange={e => setTextInput(p => ({ ...p, value: e.target.value }))}
                                       onBlur={finalizeText} onKeyDown={e => e.key === 'Enter' && finalizeText()}
                                       style={{ position: 'absolute', left: textInput.x, top: textInput.y, transform: 'translateY(-50%)',
                                                background: 'transparent', border: `2px dashed ${color}`, color, 
                                                font: `bold ${thickness * 4}px Inter, sans-serif`, outline: 'none', 
                                                minWidth: '100px', zIndex: 100, textShadow: '0 0 4px rgba(0,0,0,0.5)' }} />
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
