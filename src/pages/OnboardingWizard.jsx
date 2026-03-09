import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { Building, Rocket, Users, CheckCircle, ChevronRight, ChevronLeft, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OnboardingWizard() {
    const { user } = useAuth();
    const { createProject } = useProject();
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form states
    const [projectName, setProjectName] = useState('');
    const [projectDesc, setProjectDesc] = useState('');
    const [invites, setInvites] = useState(['']);

    const nextStep = () => setStep(s => s + 1);
    const prevStep = () => setStep(s => s - 1);

    const handleCreateProject = async () => {
        if (!projectName) {
            toast.error("Project name is required");
            return;
        }
        setLoading(true);
        const res = await createProject(projectName, projectDesc);
        setLoading(false);
        if (res.success) {
            nextStep();
        } else {
            toast.error("Failed to create project: " + res.error);
        }
    };

    const handleFinish = () => {
        const home = user.role === 'admin' ? '/admin' : user.role === 'contractor' ? '/contractor' : '/consultant';
        navigate(home);
    };

    const addInvite = () => setInvites([...invites, '']);
    const updateInvite = (idx, val) => {
        const newInvites = [...invites];
        newInvites[idx] = val;
        setInvites(newInvites);
    };

    return (
        <div className="onboarding-page">
            <div className="onboarding-container">
                {/* Progress Bar */}
                <div className="onboarding-progress">
                    {[1, 2, 3, 4].map(i => (
                        <div
                            key={i}
                            className={`progress-step ${step >= i ? 'active' : ''} ${step > i ? 'complete' : ''}`}
                        >
                            {step > i ? <CheckCircle size={16} /> : i}
                        </div>
                    ))}
                </div>

                <div className="onboarding-card">
                    {step === 1 && (
                        <div className="wizard-step">
                            <div className="wizard-icon welcome">
                                <Rocket size={48} />
                            </div>
                            <h1>Welcome to ProWay!</h1>
                            <p>Let's get your workspace ready in a few simple steps. First, tell us about your company.</p>

                            <div className="wizard-info-box">
                                <Building size={20} />
                                <div>
                                    <strong>Company:</strong> {user?.company || 'Not set'}
                                </div>
                            </div>

                            <button className="btn btn-primary wizard-next" onClick={nextStep}>
                                Get Started <ChevronRight size={18} />
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="wizard-step">
                            <div className="wizard-icon">
                                <Building size={40} />
                            </div>
                            <h1>Create Your First Project</h1>
                            <p>Projects help you organize RFIs and team members for specific job sites.</p>

                            <div className="wizard-form">
                                <div className="form-group">
                                    <label>Project Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Downtown Plaza Phase 1"
                                        value={projectName}
                                        onChange={e => setProjectName(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Description (Optional)</label>
                                    <textarea
                                        placeholder="Briefly describe the project scope..."
                                        value={projectDesc}
                                        onChange={e => setProjectDesc(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="wizard-actions">
                                <button className="btn btn-ghost" onClick={prevStep}>Back</button>
                                <button className="btn btn-primary" onClick={handleCreateProject} disabled={loading}>
                                    {loading ? 'Creating...' : 'Create Project'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="wizard-step">
                            <div className="wizard-icon">
                                <Users size={40} />
                            </div>
                            <h1>Invite Your Team</h1>
                            <p>Add team members now or skip this step for later. (Note: Currently only manual admin assignment is fully functional)</p>

                            <div className="wizard-form">
                                {invites.map((email, idx) => (
                                    <div key={idx} className="form-group">
                                        <input
                                            type="email"
                                            placeholder="colleague@company.com"
                                            value={email}
                                            onChange={e => updateInvite(idx, e.target.value)}
                                        />
                                    </div>
                                ))}
                                <button className="btn btn-ghost btn-sm" onClick={addInvite}>+ Add Another</button>
                            </div>

                            <div className="wizard-actions">
                                <button className="btn btn-ghost" onClick={nextStep}>Skip</button>
                                <button className="btn btn-primary" onClick={nextStep}>Next</button>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="wizard-step">
                            <div className="wizard-icon complete">
                                <CheckCircle size={64} />
                            </div>
                            <h1>You're All Set!</h1>
                            <p>Your first project <strong>{projectName}</strong> has been created. You can now start filing RFIs.</p>

                            <div className="onboarding-summary">
                                <div className="summary-item">
                                    <Shield size={18} />
                                    <span>Role: {user?.role.toUpperCase()}</span>
                                </div>
                                <div className="summary-item">
                                    <Building size={18} />
                                    <span>Company: {user?.company}</span>
                                </div>
                            </div>

                            <button className="btn btn-primary btn-lg" onClick={handleFinish} style={{ width: '100%', marginTop: '1rem' }}>
                                Go to Dashboard
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
