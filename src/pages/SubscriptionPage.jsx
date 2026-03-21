import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import { BadgeCheck, Calendar, CreditCard, Zap, CircleCheck, Info, ArrowUpRight } from 'lucide-react';

export default function SubscriptionPage() {
    const { user } = useAuth();
    
    // Mock simulation
    const remainingDays = 14; 
    const billingCycle = "Monthly";
    const nextBillingDate = new Date();
    nextBillingDate.setDate(nextBillingDate.getDate() + remainingDays);

    if (!user) return null;

    return (
        <div className="page-wrapper">
            <Header />
            <main className="main-content dashboard-page">
                <header className="v53-page-header">
                    <h1>Subscription Plan</h1>
                    <p>Transparent billing and enterprise-grade performance features.</p>
                </header>

                <div className="v53-card" style={{ border: '1px solid #bbf7d0', background: 'linear-gradient(to bottom right, #ffffff, #f0fdf4)' }}>
                    <div className="v53-sub-header">
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                <span className="v53-plan-title">ProWay Max</span>
                                <span style={{ background: '#15803d', color: 'white', fontSize: '0.7rem', fontWeight: '800', padding: '0.25rem 0.6rem', borderRadius: '0.5rem', letterSpacing: '0.05em' }}>ACTIVE</span>
                            </div>
                            <p style={{ color: 'var(--clr-text-secondary)', fontSize: '1.1rem', fontWeight: '500' }}>
                                All-access enterprise features for professional workflows.
                            </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div className="v53-price">$29<span style={{ fontSize: '1.25rem', color: 'var(--clr-text-muted)', fontWeight: '500' }}>/mo</span></div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)', fontWeight: '600' }}>Next billing: {nextBillingDate.toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div style={{ margin: '3rem 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
                        <div className="v53-stat-box">
                            <p className="v53-label"><Calendar size={14} /> Cycle</p>
                            <p className="v53-value">{billingCycle}</p>
                        </div>
                        <div className="v53-stat-box">
                            <p className="v53-label"><Zap size={14} /> Capacity</p>
                            <p className="v53-value">Unlimited</p>
                        </div>
                        <div className="v53-stat-box">
                            <p className="v53-label"><CreditCard size={14} /> Method</p>
                            <p className="v53-value">•••• 4242</p>
                        </div>
                        <div className="v53-stat-box" style={{ background: 'var(--clr-brand-secondary)', color: 'white', border: 'none' }}>
                            <p className="v53-label" style={{ color: 'rgba(255,255,255,0.6)' }}>Remaining</p>
                            <p className="v53-value" style={{ color: 'white', fontSize: '1.5rem' }}>{remainingDays} Days</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button style={{ flex: 1, padding: '1rem', borderRadius: '0.85rem', border: 'none', background: '#15803d', color: 'white', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            Update Plan <ArrowUpRight size={18} />
                        </button>
                        <button style={{ flex: 1, padding: '1rem', borderRadius: '0.85rem', border: '1px solid var(--clr-border)', background: 'white', color: 'var(--clr-brand-primary)', fontWeight: '700', cursor: 'pointer' }}>
                            Download Last Invoice
                        </button>
                    </div>
                </div>

                <div className="v53-grid" style={{ marginTop: '2rem' }}>
                    <div className="v53-card" style={{ padding: '2rem' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', fontSize: '1.25rem' }}>
                            <BadgeCheck size={22} color="#15803d" /> Key Benefits
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {[
                                "Unlimited RFI Generation",
                                "Custom Export Templates",
                                "Priority Cloud Syncing",
                                "Multi-User Collaboration"
                            ].map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', color: 'var(--clr-text-secondary)', fontWeight: '500' }}>
                                    <CircleCheck size={18} color="#10b981" /> {item}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="v53-card" style={{ padding: '2rem', background: '#f8fafc' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', fontSize: '1.25rem' }}>
                            <Info size={22} color="var(--clr-brand-accent)" /> Billing Support
                        </h3>
                        <p style={{ color: 'var(--clr-text-secondary)', marginBottom: '1.5rem' }}>
                            Our team is available 24/7 to assist with any billing inquiries or plan adjustments.
                        </p>
                        <button style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid var(--clr-brand-accent)', background: 'transparent', color: 'var(--clr-brand-accent)', fontWeight: '600', cursor: 'pointer' }}>
                            Contact Support
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
