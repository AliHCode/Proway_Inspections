import { useEffect, useRef, useState } from 'react';
import { X, Undo2, RotateCcw, Save } from 'lucide-react';

export default function ImageMarkupModal({ image, onSave, onClose }) {
    const canvasRef = useRef(null);
    const historyRef = useRef([]);
    const [drawing, setDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(5);
    const [brushColor, setBrushColor] = useState('#ef4444');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!image || !canvasRef.current) return;

        let objectUrl = null;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const img = new Image();

        if (typeof image === 'string') {
            img.src = image;
        } else {
            objectUrl = URL.createObjectURL(image);
            img.src = objectUrl;
        }

        img.onload = () => {
            const maxWidth = 960;
            const scale = Math.min(1, maxWidth / img.width);
            canvas.width = Math.max(320, Math.floor(img.width * scale));
            canvas.height = Math.max(220, Math.floor(img.height * scale));

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
            setLoading(false);
        };

        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [image]);

    const pointFromEvent = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    };

    const beginDraw = (e) => {
        if (!canvasRef.current || loading) return;
        e.preventDefault();

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { x, y } = pointFromEvent(e);

        historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = brushColor;
        setDrawing(true);
    };

    const draw = (e) => {
        if (!drawing || !canvasRef.current) return;
        e.preventDefault();

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { x, y } = pointFromEvent(e);

        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const endDraw = () => {
        if (!drawing) return;
        setDrawing(false);
    };

    const undo = () => {
        const canvas = canvasRef.current;
        if (!canvas || historyRef.current.length <= 1) return;

        historyRef.current.pop();
        const previous = historyRef.current[historyRef.current.length - 1];
        const ctx = canvas.getContext('2d');
        ctx.putImageData(previous, 0, 0);
    };

    const resetMarkup = () => {
        const canvas = canvasRef.current;
        if (!canvas || historyRef.current.length === 0) return;

        const firstState = historyRef.current[0];
        const ctx = canvas.getContext('2d');
        ctx.putImageData(firstState, 0, 0);
        historyRef.current = [firstState];
    };

    const saveMarkup = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.toBlob((blob) => {
            if (!blob) return;
            const name = image instanceof File ? image.name.replace(/\.[^.]+$/, '') : 'annotated-image';
            const file = new File([blob], `${name}-marked.png`, { type: 'image/png' });
            onSave(file);
        }, 'image/png', 0.92);
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
            <div className="modal-content image-markup-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Photo Markup</h3>
                    <button className="modal-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="image-markup-toolbar">
                    <label>
                        Brush
                        <input
                            type="range"
                            min="2"
                            max="18"
                            value={brushSize}
                            onChange={(e) => setBrushSize(Number(e.target.value))}
                        />
                    </label>
                    <input
                        type="color"
                        value={brushColor}
                        onChange={(e) => setBrushColor(e.target.value)}
                        title="Brush color"
                    />
                    <button className="btn btn-sm btn-ghost" onClick={undo}>
                        <Undo2 size={14} /> Undo
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={resetMarkup}>
                        <RotateCcw size={14} /> Reset
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={saveMarkup}>
                        <Save size={14} /> Save Markup
                    </button>
                </div>

                <div className="image-markup-canvas-wrap">
                    <canvas
                        ref={canvasRef}
                        className="image-markup-canvas"
                        onMouseDown={beginDraw}
                        onMouseMove={draw}
                        onMouseUp={endDraw}
                        onMouseLeave={endDraw}
                        onTouchStart={beginDraw}
                        onTouchMove={draw}
                        onTouchEnd={endDraw}
                    />
                </div>
            </div>
        </div>
    );
}
