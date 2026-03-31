import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Link2, Plus, Save, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../components/Header';
import { useProject } from '../context/ProjectContext';
import {
    buildTemplateFieldOptions,
    getContractorExcelTemplateConfig,
    inspectExcelTemplate,
    mergeContractorExcelTemplateConfig,
    uploadContractorExcelTemplate,
} from '../utils/contractorExcelTemplate';

function createEmptyMapping() {
    return {
        cell: '',
        fieldKey: '',
        label: '',
        prefix: '',
    };
}

export default function AdminExcelTemplatePage() {
    const { activeProject, orderedTableColumns, projectFields, saveProjectExportTemplate } = useProject();
    const [draft, setDraft] = useState(getContractorExcelTemplateConfig(activeProject?.export_template));
    const [pendingFile, setPendingFile] = useState(null);
    const [sheetNames, setSheetNames] = useState([]);
    const [loadingMeta, setLoadingMeta] = useState(false);
    const [saving, setSaving] = useState(false);

    const fieldOptions = useMemo(() => (
        buildTemplateFieldOptions(orderedTableColumns, projectFields)
            .sort((a, b) => a.label.localeCompare(b.label))
    ), [orderedTableColumns, projectFields]);

    useEffect(() => {
        const nextDraft = getContractorExcelTemplateConfig(activeProject?.export_template);
        setDraft(nextDraft);
        setPendingFile(null);

        let ignore = false;
        async function loadSheetNames() {
            if (!nextDraft.templatePublicUrl) {
                setSheetNames([]);
                return;
            }

            setLoadingMeta(true);
            try {
                const meta = await inspectExcelTemplate(nextDraft.templatePublicUrl);
                if (!ignore) {
                    setSheetNames(meta.sheetNames || []);
                }
            } catch (error) {
                if (!ignore) {
                    setSheetNames([]);
                }
            } finally {
                if (!ignore) {
                    setLoadingMeta(false);
                }
            }
        }

        loadSheetNames();
        return () => {
            ignore = true;
        };
    }, [activeProject?.id, activeProject?.export_template]);

    async function handleTemplateFileChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.xlsx')) {
            toast.error('Please upload an .xlsx Excel template file.');
            event.target.value = '';
            return;
        }

        setPendingFile(file);
        setLoadingMeta(true);
        try {
            const meta = await inspectExcelTemplate(file);
            const nextSheetName = meta.sheetNames?.[0] || '';
            setSheetNames(meta.sheetNames || []);
            setDraft((prev) => ({
                ...prev,
                enabled: true,
                templateFileName: file.name,
                templateSheetName: prev.templateSheetName || nextSheetName,
            }));
            toast.success('Template loaded. Map the cells you want to fill.');
        } catch (error) {
            console.error('Failed to inspect Excel template:', error);
            toast.error('Could not read this Excel template file.');
            setPendingFile(null);
        } finally {
            setLoadingMeta(false);
            event.target.value = '';
        }
    }

    function updateMapping(index, patch) {
        setDraft((prev) => ({
            ...prev,
            mappings: prev.mappings.map((mapping, mapIndex) => (
                mapIndex === index ? { ...mapping, ...patch } : mapping
            )),
        }));
    }

    function addMapping() {
        setDraft((prev) => ({
            ...prev,
            mappings: [...prev.mappings, createEmptyMapping()],
        }));
    }

    function removeMapping(index) {
        setDraft((prev) => ({
            ...prev,
            mappings: prev.mappings.filter((_, mapIndex) => mapIndex !== index),
        }));
    }

    async function handleSave() {
        if (!activeProject?.id) {
            toast.error('Choose a project first.');
            return;
        }

        if (!draft.templatePublicUrl && !pendingFile) {
            toast.error('Upload a contractor Excel template first.');
            return;
        }

        if (!draft.templateSheetName) {
            toast.error('Pick the base sheet from the uploaded workbook.');
            return;
        }

        setSaving(true);
        try {
            let uploadedMeta = {};
            if (pendingFile) {
                uploadedMeta = await uploadContractorExcelTemplate(pendingFile, activeProject.id);
            }

            const cleanedMappings = (draft.mappings || [])
                .map((mapping) => ({
                    cell: String(mapping.cell || '').trim().toUpperCase(),
                    fieldKey: String(mapping.fieldKey || '').trim(),
                    label: String(mapping.label || '').trim(),
                    prefix: typeof mapping.prefix === 'string' ? mapping.prefix : '',
                }))
                .filter((mapping) => mapping.cell && (mapping.fieldKey || mapping.prefix));

            const nextProjectTemplate = mergeContractorExcelTemplateConfig(activeProject.export_template, {
                ...draft,
                ...uploadedMeta,
                enabled: true,
                templateFileName: uploadedMeta.templateFileName || draft.templateFileName,
                templateStoragePath: uploadedMeta.templateStoragePath || draft.templateStoragePath,
                templatePublicUrl: uploadedMeta.templatePublicUrl || draft.templatePublicUrl,
                templateSheetName: draft.templateSheetName,
                mappings: cleanedMappings,
            });

            const result = await saveProjectExportTemplate(nextProjectTemplate);
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to save contractor Excel template.');
            }

            setPendingFile(null);
            toast.success('Contractor Excel template saved for this project.');
        } catch (error) {
            console.error('Error saving contractor Excel template:', error);
            toast.error(error.message || 'Failed to save contractor Excel template.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDisable() {
        if (!activeProject?.id) return;
        setSaving(true);
        try {
            const nextProjectTemplate = mergeContractorExcelTemplateConfig(activeProject.export_template, {
                enabled: false,
                templateFileName: '',
                templateStoragePath: '',
                templatePublicUrl: '',
                templateSheetName: '',
                keepOriginalSheets: false,
                mappings: [],
            });

            const result = await saveProjectExportTemplate(nextProjectTemplate);
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to disable template.');
            }

            setDraft(getContractorExcelTemplateConfig(nextProjectTemplate));
            setPendingFile(null);
            setSheetNames([]);
            toast.success('Contractor Excel template disabled.');
        } catch (error) {
            console.error('Error disabling template:', error);
            toast.error(error.message || 'Failed to disable template.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="page-wrapper">
            <Header />
            <main className="dashboard-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <section style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>RFI Excel Templates</h1>
                        <p style={{ margin: '0.35rem 0 0', color: '#64748b', maxWidth: '760px' }}>
                            Upload the contractor&apos;s Excel form, choose the blank base sheet, and map cells like <strong>B10</strong> to project RFI fields.
                            If a mapped field has no value for an RFI, that cell is left blank in the generated report.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-ghost"
                            onClick={handleDisable}
                            disabled={saving || (!draft.templatePublicUrl && !pendingFile)}
                        >
                            Disable Template
                        </button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={saving || loadingMeta}>
                            <Save size={16} /> {saving ? 'Saving...' : 'Save Template'}
                        </button>
                    </div>
                </section>

                <section style={{ padding: '1rem 1.1rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155', fontSize: '0.92rem' }}>
                    This page controls the contractor&apos;s custom per-RFI Excel workbooks. The existing <strong>Daily Summary Format</strong> page still controls the PDF/table-style summary layout.
                </section>

                <section style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)', gap: '1rem' }}>
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                <FileSpreadsheet size={18} /> Workbook Setup
                            </h2>
                            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                Active project: <strong>{activeProject?.name || 'No project selected'}</strong>
                            </p>
                        </div>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Upload Excel Template
                            </span>
                            <label
                                htmlFor="contractor-template-upload"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.6rem',
                                    minHeight: '120px',
                                    borderRadius: '16px',
                                    border: '2px dashed #cbd5e1',
                                    background: '#f8fafc',
                                    color: '#334155',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    textAlign: 'center',
                                    padding: '1rem',
                                }}
                            >
                                <Upload size={18} />
                                {pendingFile ? pendingFile.name : draft.templateFileName || 'Choose an .xlsx file'}
                            </label>
                            <input id="contractor-template-upload" type="file" accept=".xlsx" onChange={handleTemplateFileChange} style={{ display: 'none' }} />
                        </label>

                        {(draft.templatePublicUrl || pendingFile) && (
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                {draft.templatePublicUrl && (
                                    <a href={draft.templatePublicUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
                                        <Link2 size={15} /> Open Current Template
                                    </a>
                                )}
                                {loadingMeta && <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Reading workbook sheets...</span>}
                            </div>
                        )}

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Base Sheet
                            </span>
                            <select
                                className="premium-select"
                                value={draft.templateSheetName}
                                onChange={(event) => setDraft((prev) => ({ ...prev, templateSheetName: event.target.value }))}
                                disabled={sheetNames.length === 0}
                            >
                                <option value="">{sheetNames.length ? 'Select a blank template sheet' : 'Upload a workbook first'}</option>
                                {sheetNames.map((sheetName) => (
                                    <option key={sheetName} value={sheetName}>{sheetName}</option>
                                ))}
                            </select>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.9rem 1rem', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#fff' }}>
                            <input
                                type="checkbox"
                                checked={draft.keepOriginalSheets}
                                onChange={(event) => setDraft((prev) => ({ ...prev, keepOriginalSheets: event.target.checked }))}
                                style={{ marginTop: '0.2rem' }}
                            />
                            <div>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>Keep original sheets in export</div>
                                <div style={{ color: '#64748b', fontSize: '0.86rem' }}>
                                    Leave this off if you want the downloaded workbook to contain only generated RFI sheets.
                                </div>
                            </div>
                        </label>
                    </div>

                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Cell Mapping</h2>
                                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                    Example: <strong>B10 → Description</strong>, <strong>E19 → Inspection Time</strong>
                                </p>
                            </div>
                            <button className="btn btn-ghost" onClick={addMapping}>
                                <Plus size={15} /> Add Mapping
                            </button>
                        </div>

                        {draft.mappings.length === 0 ? (
                            <div style={{ borderRadius: '16px', border: '1px dashed #cbd5e1', background: '#f8fafc', padding: '1.25rem', color: '#64748b' }}>
                                No cells mapped yet. Add the Excel cells you want the system to fill from RFI data.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {draft.mappings.map((mapping, index) => (
                                    <div
                                        key={`${index}_${mapping.cell}_${mapping.fieldKey}`}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '140px 220px minmax(0, 1fr) auto',
                                            gap: '0.75rem',
                                            alignItems: 'center',
                                            borderRadius: '16px',
                                            border: '1px solid #e2e8f0',
                                            padding: '0.9rem',
                                            background: '#fff',
                                        }}
                                    >
                                        <input
                                            type="text"
                                            className="premium-input"
                                            value={mapping.cell}
                                            onChange={(event) => updateMapping(index, { cell: event.target.value.toUpperCase() })}
                                            placeholder="Cell e.g. B10"
                                        />
                                        <input
                                            type="text"
                                            className="premium-input"
                                            value={mapping.prefix || ''}
                                            onChange={(event) => updateMapping(index, { prefix: event.target.value })}
                                            placeholder="Prefix / fixed text"
                                        />
                                        <select
                                            className="premium-select"
                                            value={mapping.fieldKey}
                                            onChange={(event) => {
                                                const selected = fieldOptions.find((option) => option.key === event.target.value);
                                                updateMapping(index, {
                                                    fieldKey: event.target.value,
                                                    label: selected?.label || '',
                                                });
                                            }}
                                        >
                                            <option value="">No dropdown field</option>
                                            {fieldOptions.map((option) => (
                                                <option key={option.key} value={option.key}>
                                                    {option.label} ({option.key})
                                                </option>
                                            ))}
                                        </select>
                                        <button className="btn btn-ghost" onClick={() => removeMapping(index)} title="Remove mapping">
                                            <Trash2 size={15} />
                                        </button>
                                        <div style={{ gridColumn: '2 / 4', marginTop: '-0.15rem', fontSize: '0.82rem', color: '#64748b' }}>
                                            {mapping.fieldKey
                                                ? 'Output: prefix + selected field value. If the field is blank, the prefix is still kept.'
                                                : 'Output: fixed text only. Leave the dropdown empty for the same value on every generated sheet.'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ padding: '0.95rem 1rem', borderRadius: '14px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: '0.9rem' }}>
                            Use the blank contractor sheet as your base. Each mapped cell can now be:
                            <strong> field only</strong>, <strong>prefix + field</strong>, or <strong>fixed text only</strong>.
                            The exporter overwrites only the mapped cells. If a contractor uploads a sample sheet with old values in other cells, those unchanged cells stay exactly as they are in the template.
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
