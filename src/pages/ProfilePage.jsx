import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import { Camera, Mail, Building, User, Edit2, Shield, Globe, Calendar, BadgeCheck, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../utils/supabaseClient';

export default function ProfilePage() {
    const { user, updateProfile } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [formData, setFormData] = useState({
        name: user?.name || '',
        company: user?.company || '',
    });
    const fileInputRef = useRef(null);

    if (!user) return null;

    const nameInitials = user.name
        ? user.name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('')
        : 'U';

    const handleSave = async () => {
        const { success, error } = await updateProfile({
            name: formData.name,
            company: formData.company
        });

        if (success) {
            setIsEditing(false);
            toast.success('Profile details updated');
        } else {
            toast.error(`Update failed: ${error}`);
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Limit size (e.g., 2MB)
        if (file.size > 2 * 1024 * 1024) {
            toast.error("Image must be smaller than 2MB");
            return;
        }

        setIsUploading(true);
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        try {
            // 1. Upload to storage
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // 3. Update profile record
            const { success, error: updateError } = await updateProfile({
                avatar_url: publicUrl
            });

            if (!success) throw new Error(updateError);

            toast.success("Profile picture updated!");
        } catch (error) {
            console.error("Upload error:", error);
            toast.error(`Upload failed: ${error.message}`);
        } finally {
            setIsUploading(false);
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="page-wrapper">
            <Header />
            <main className="main-content dashboard-page">
                <header className="v53-page-header">
                    <h1>Account Settings</h1>
                    <p>Manage your professional identity and security preferences.</p>
                </header>

                <div className="v53-card">
                    <section className="v53-avatar-section">
                        <div className="v53-avatar-wrapper">
                            <div className="v53-avatar-circle" style={{ overflow: 'hidden' }}>
                                {user.avatar_url ? (
                                    <img 
                                        src={user.avatar_url} 
                                        alt={user.name} 
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                    />
                                ) : (
                                    nameInitials
                                )}
                                {isUploading && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyCenter: 'center', borderRadius: '50%' }}>
                                        <Loader2 className="animate-spin" color="white" />
                                    </div>
                                )}
                            </div>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                style={{ display: 'none' }} 
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                            <button 
                                className="avatar-edit-icon" 
                                style={{ width: '32px', height: '32px', bottom: '0', right: '0' }}
                                onClick={handleAvatarClick}
                                disabled={isUploading}
                            >
                                <Camera size={16} />
                            </button>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--clr-brand-secondary)' }}>{user.name}</h2>
                                <BadgeCheck size={20} color="#10b981" />
                            </div>
                            <p style={{ color: 'var(--clr-text-secondary)', fontWeight: '500', fontSize: '1.1rem' }}>
                                {user.role?.toUpperCase()} MEMBER
                            </p>
                        </div>
                    </section>

                    <div className="v53-grid">
                        <div className="v53-field">
                            <label className="v53-label"><User size={14} /> Full Name</label>
                            {isEditing ? (
                                <input 
                                    className="form-input" 
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid var(--clr-border)', fontSize: '1.1rem' }}
                                />
                            ) : (
                                <div className="v53-value">{user.name}</div>
                            )}
                        </div>

                        <div className="v53-field">
                            <label className="v53-label"><Mail size={14} /> Email Address</label>
                            <div className="v53-value" style={{ color: 'var(--clr-text-muted)' }}>{user.email}</div>
                        </div>

                        <div className="v53-field">
                            <label className="v53-label"><Building size={14} /> Organization</label>
                            {isEditing ? (
                                <input 
                                    className="form-input" 
                                    value={formData.company}
                                    onChange={(e) => setFormData({...formData, company: e.target.value})}
                                    style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid var(--clr-border)', fontSize: '1.1rem' }}
                                />
                            ) : (
                                <div className="v53-value">{user.company || 'ClearLine Inc.'}</div>
                            )}
                        </div>

                        <div className="v53-field">
                            <label className="v53-label"><Globe size={14} /> Timezone</label>
                            <div className="v53-value">UTC+04:00 (Dubai)</div>
                        </div>

                        <div className="v53-field">
                            <label className="v53-label"><Calendar size={14} /> Member Since</label>
                            <div className="v53-value">March 2026</div>
                        </div>

                        <div className="v53-field">
                            <label className="v53-label"><Shield size={14} /> Security Status</label>
                            <div className="v53-value" style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                Optimized
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: '4rem', display: 'flex', justifyContent: 'flex-end', gap: '1.5rem', borderTop: '1px solid var(--clr-border)', paddingTop: '2rem' }}>
                        {isEditing ? (
                            <>
                                <button 
                                    onClick={() => setIsEditing(false)}
                                    style={{ padding: '0.75rem 1.5rem', borderRadius: '0.75rem', border: '1px solid var(--clr-border)', background: 'white', fontWeight: '600', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleSave}
                                    style={{ padding: '0.75rem 2rem', borderRadius: '0.75rem', border: 'none', background: 'var(--clr-brand-secondary)', color: 'white', fontWeight: '600', cursor: 'pointer' }}
                                >
                                    Save Profile
                                </button>
                            </>
                        ) : (
                            <button 
                                onClick={() => setIsEditing(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.75rem', borderRadius: '0.75rem', border: '1px solid var(--clr-brand-secondary)', background: 'white', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}
                            >
                                <Edit2 size={16} /> Edit Details
                            </button>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
