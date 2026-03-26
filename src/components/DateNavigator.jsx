import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { formatDateDisplay, getToday } from '../utils/rfiLogic';

export default function DateNavigator({ currentDate, onDateChange, minDate, showArrows = true, disabled = false }) {
    const today = getToday();
    const isToday = currentDate === today;
    const isMinDate = minDate && currentDate <= minDate;
    const dateInputRef = useRef(null);

    function adjustDate(days) {
        if (days < 0 && isMinDate) return;
        if (days > 0 && isToday) return;

        const [year, month, day] = currentDate.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        d.setDate(d.getDate() + days);
        const yStr = d.getFullYear();
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const dStr = String(d.getDate()).padStart(2, '0');
        const nextDate = `${yStr}-${mStr}-${dStr}`;

        if (minDate && nextDate < minDate) return;
        if (nextDate > today) return;

        onDateChange(nextDate);
    }

    function goBack() {
        adjustDate(-1);
    }

    function goForward() {
        adjustDate(1);
    }

    function goToday() {
        onDateChange(today);
    }

    const handleLabelClick = () => {
        if (dateInputRef.current) {
            if (dateInputRef.current.showPicker) {
                dateInputRef.current.showPicker();
            } else {
                dateInputRef.current.click();
            }
        }
    };

    return (
        <div className={`date-navigator ${disabled ? 'disabled' : ''}`} style={disabled ? { opacity: 0.6, pointerEvents: 'none', filter: 'grayscale(0.5)' } : {}}>
            {showArrows && (
                <button 
                    className={`integrated-nav-btn ${isMinDate ? 'disabled' : ''}`} 
                    onClick={isMinDate ? null : goBack}
                    disabled={isMinDate}
                    title={isMinDate ? "Reached the first RFI date" : "Previous Day"}
                    style={isMinDate ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                >
                    <ChevronLeft size={16} />
                </button>
            )}

            <div 
                className={`date-nav-center ${!showArrows ? 'full-width' : ''}`}
                onClick={handleLabelClick}
                style={{ cursor: 'pointer' }}
                title="Open calendar"
            >
                <Calendar size={16} style={{ color: 'var(--clr-text-muted)' }} />
                <span className="date-nav-label">{formatDateDisplay(currentDate)}</span>
                {isToday && <span className="today-badge">Today</span>}
            </div>
            
            {showArrows && (
                <button 
                    className={`integrated-nav-btn ${isToday ? 'disabled' : ''}`} 
                    onClick={isToday ? null : goForward}
                    disabled={isToday}
                    title={isToday ? "Cannot navigate to future" : "Next Day"}
                    style={isToday ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                >
                    <ChevronRight size={16} />
                </button>
            )}

            <input
                ref={dateInputRef}
                type="date"
                value={currentDate}
                min={minDate}
                max={today}
                onChange={(e) => {
                    const val = e.target.value;
                    if (minDate && val < minDate) return;
                    if (val > today) return;
                    onDateChange(val);
                }}
                style={{
                    position: 'absolute',
                    opacity: 0,
                    width: 0,
                    height: 0,
                    pointerEvents: 'none'
                }}
            />

            {!isToday && showArrows && (
                <button className="date-nav-today-btn" onClick={goToday}>
                    Go Today
                </button>
            )}
        </div>
    );
}
