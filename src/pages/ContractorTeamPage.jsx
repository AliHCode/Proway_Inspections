import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, MessageSquare, FileText, Eye, Archive } from 'lucide-react';
import Header from '../components/Header';
import UserAvatar from '../components/UserAvatar';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';

function getAccessLabel(member) {
    const capabilities = [];

    if (member.can_file_rfis !== false) capabilities.push('file RFIs');
    if (member.can_discuss_rfis !== false) capabilities.push('post in discussion');
    if (member.can_manage_contractor_permissions === true || member.can_upload_rfi_archive === true) {
        capabilities.push('upload archive files');
    }

    if (capabilities.length === 0) {
        return 'View only';
    }

    if (capabilities.length === 1) {
        return `Can ${capabilities[0]} only`;
    }

    if (capabilities.length === 2) {
        return `Can ${capabilities[0]} and ${capabilities[1]}`;
    }

    return `Can ${capabilities[0]}, ${capabilities[1]}, and ${capabilities[2]}`;
}

export default function ContractorTeamPage() {
    const { user } = useAuth();
    const { activeProject, projectMembers, contractorPermissions, updateContractorPermissions } = useProject();
    const [savingIds, setSavingIds] = useState({});

    const contractorMembers = useMemo(() => (
        (projectMembers || [])
            .filter((member) => member.role === 'contractor')
            .sort((a, b) => {
                if (a.can_manage_contractor_permissions === b.can_manage_contractor_permissions) {
                    return (a.profiles?.name || '').localeCompare(b.profiles?.name || '');
                }
                return a.can_manage_contractor_permissions ? -1 : 1;
            })
    ), [projectMembers]);

    const stats = useMemo(() => ({
        total: contractorMembers.length,
        filing: contractorMembers.filter((member) => member.can_file_rfis !== false).length,
        discussion: contractorMembers.filter((member) => member.can_discuss_rfis !== false).length,
        archiveUpload: contractorMembers.filter((member) => member.can_manage_contractor_permissions === true || member.can_upload_rfi_archive === true).length,
        viewOnly: contractorMembers.filter((member) => (
            member.can_file_rfis === false
            && member.can_discuss_rfis === false
            && member.can_manage_contractor_permissions !== true
            && member.can_upload_rfi_archive !== true
        )).length,
    }), [contractorMembers]);

    async function handleToggle(member, field) {
        const nextValue = !(member[field] !== false);
        const nextPermissions = {
            can_file_rfis: field === 'can_file_rfis' ? nextValue : member.can_file_rfis !== false,
            can_discuss_rfis: field === 'can_discuss_rfis' ? nextValue : member.can_discuss_rfis !== false,
            can_upload_rfi_archive: field === 'can_upload_rfi_archive'
                ? nextValue
                : member.can_upload_rfi_archive === true,
        };

        setSavingIds((prev) => ({ ...prev, [member.user_id]: true }));
        const result = await updateContractorPermissions(activeProject.id, member.user_id, nextPermissions);
        setSavingIds((prev) => ({ ...prev, [member.user_id]: false }));

        if (!result?.success) {
            toast.error(result?.error || 'Unable to update contractor access.');
            return;
        }

        toast.success(`Updated ${member.profiles?.name || 'contractor'} access.`);
    }

    return (
        <div className="page-wrapper premium-dashboard">
            <Header />
            <main className="dashboard-page">
                <div className="sheet-header" style={{ marginBottom: '1rem' }}>
                    <div>
                        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <ShieldCheck size={24} /> Contractor Team Access
                        </h1>
                        <p className="subtitle" style={{ marginTop: '0.35rem' }}>
                            Manage which contractor accounts can file RFIs, post in the project discussion, or upload scanned archive files for {activeProject?.name || 'this project'}.
                        </p>
                    </div>
                </div>

                {!contractorPermissions.canManageContractorPermissions ? (
                    <div style={{ padding: '1.2rem', borderRadius: '16px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', maxWidth: '780px' }}>
                        Only the lead contractor for this project can manage contractor access rights. An admin can mark a contractor as the lead from the project team screen.
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.9rem', marginBottom: '1rem' }}>
                            <div style={{ padding: '1rem', borderRadius: '16px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
                                <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>Contractors</div>
                                <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 700 }}>{stats.total}</div>
                            </div>
                            <div style={{ padding: '1rem', borderRadius: '16px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
                                <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>Can File RFIs</div>
                                <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 700 }}>{stats.filing}</div>
                            </div>
                            <div style={{ padding: '1rem', borderRadius: '16px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
                                <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>Can Discuss</div>
                                <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 700 }}>{stats.discussion}</div>
                            </div>
                            <div style={{ padding: '1rem', borderRadius: '16px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
                                <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>Can Upload Archive</div>
                                <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 700 }}>{stats.archiveUpload}</div>
                            </div>
                            <div style={{ padding: '1rem', borderRadius: '16px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
                                <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>View Only</div>
                                <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 700 }}>{stats.viewOnly}</div>
                            </div>
                        </div>

                        <div style={{ padding: '1rem', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                            {contractorMembers.length === 0 ? (
                                <div style={{ padding: '1.2rem 0.25rem', color: '#64748b' }}>No contractors are assigned to this project yet.</div>
                            ) : contractorMembers.map((member) => {
                                const isLead = member.can_manage_contractor_permissions === true;
                                const isSelf = member.user_id === user?.id;
                                const locked = savingIds[member.user_id] || isLead;

                                return (
                                    <div key={member.id} style={{ border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                                <UserAvatar name={member.profiles?.name} avatarUrl={member.profiles?.avatar_url} size={42} />
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                        <span>{member.profiles?.name || 'Contractor'}</span>
                                                        {isLead && <span className="ustat-pill" style={{ fontSize: '0.72rem' }}>Lead Contractor</span>}
                                                        {isSelf && <span className="ustat-pill" style={{ fontSize: '0.72rem' }}>You</span>}
                                                    </div>
                                                    <div style={{ color: '#64748b', fontSize: '0.9rem' }}>{member.profiles?.company || 'No company set'}</div>
                                                </div>
                                            </div>
                                            <div style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.9rem' }}>{getAccessLabel(member)}</div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.85rem 0.95rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontWeight: 600 }}>
                                                    <FileText size={16} /> Can File RFIs
                                                </span>
                                                <input
                                                    type="checkbox"
                                                    checked={member.can_file_rfis !== false}
                                                    disabled={locked}
                                                    onChange={() => handleToggle(member, 'can_file_rfis')}
                                                />
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.85rem 0.95rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontWeight: 600 }}>
                                                    <MessageSquare size={16} /> Can Post In Chat
                                                </span>
                                                <input
                                                    type="checkbox"
                                                    checked={member.can_discuss_rfis !== false}
                                                    disabled={locked}
                                                    onChange={() => handleToggle(member, 'can_discuss_rfis')}
                                                />
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.85rem 0.95rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontWeight: 600 }}>
                                                    <Archive size={16} /> Can Upload Archive
                                                </span>
                                                <input
                                                    type="checkbox"
                                                    checked={member.can_manage_contractor_permissions === true || member.can_upload_rfi_archive === true}
                                                    disabled={locked}
                                                    onChange={() => handleToggle(member, 'can_upload_rfi_archive')}
                                                />
                                            </label>
                                        </div>

                                        {isLead ? (
                                            <div style={{ color: '#64748b', fontSize: '0.88rem' }}>
                                                Lead contractor access stays locked here so the project manager account cannot be disabled by mistake.
                                            </div>
                                        ) : (
                                            <div style={{ color: '#64748b', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                <Eye size={14} /> If all three switches are off, this contractor can still view the archive and project data but cannot upload, discuss, or file RFIs.
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
