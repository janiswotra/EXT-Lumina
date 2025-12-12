import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Card } from './ui/Card';
import { Input, TextArea } from './ui/Input';
import { CandidateProfile } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Shared type
type CandidateData = CandidateProfile;

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    data: CandidateData;
    onUpdate: (data: CandidateData) => void;
    onSave: () => void;
    isLoading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    onClose,
    data,
    onUpdate,
    onSave,
    isLoading
}) => {
    const [formData, setFormData] = useState<CandidateData>(data);

    useEffect(() => {
        setFormData(data);
    }, [data]);

    const handleChange = (field: keyof CandidateData, value: string) => {
        const updated = { ...formData, [field]: value };
        setFormData(updated);
        onUpdate(updated);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed right-0 top-0 h-full w-[400px] bg-bg-deep text-foreground shadow-2xl flex flex-col font-sans border-l border-border-subtle z-[2147483647] pointer-events-auto overflow-hidden">

            {/* Ambient Background Blobs */}
            <div className="absolute top-[-100px] left-[50%] w-[300px] h-[300px] bg-accent/20 blur-[100px] rounded-full animate-float pointer-events-none" />
            <div className="absolute bottom-[10%] right-[-50px] w-[200px] h-[200px] bg-purple-500/10 blur-[80px] rounded-full pointer-events-none" />

            {/* Header */}
            <div className="relative px-6 py-5 border-b border-border-subtle flex items-center justify-between bg-bg-base/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-bright flex items-center justify-center text-white shadow-glow">
                        <span className="text-xs font-bold">L</span>
                    </div>
                    <span className="font-semibold text-white tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                        Lumina
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="p-2 h-auto text-foreground-subtle hover:text-white"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </Button>
            </div>

            {/* Content */}
            <div className="relative flex-1 overflow-y-auto p-6 scrollbar-none z-10">

                {/* Hero Profile Card */}
                <Card variant="glass" className="p-5 mb-8 flex items-center gap-4 bg-gradient-to-b from-white/10 to-transparent">
                    <div className="w-14 h-14 rounded-full p-[1px] bg-gradient-to-br from-accent to-purple-500 shadow-lg shrink-0">
                        <div className="w-full h-full rounded-full overflow-hidden bg-bg-elevated flex items-center justify-center">
                            {formData.profilePictureUrl ? (
                                <img src={formData.profilePictureUrl} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-lg font-bold text-white">{formData.firstName?.[0]}{formData.lastName?.[0]}</span>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold text-lg truncate leading-tight">
                            {formData.firstName} {formData.lastName}
                        </h3>
                        <p className="text-xs text-foreground-muted mt-1 truncate">{formData.headline}</p>
                        <a href={formData.linkedInUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-[10px] uppercase tracking-wider font-medium text-accent-bright hover:text-white transition-colors">
                            View Profile
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                    </div>
                </Card>

                {/* Form Fields */}
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="First Name"
                            value={formData.firstName}
                            onChange={(e) => handleChange('firstName', e.target.value)}
                            placeholder="First"
                        />
                        <Input
                            label="Last Name"
                            value={formData.lastName}
                            onChange={(e) => handleChange('lastName', e.target.value)}
                            placeholder="Last"
                        />
                    </div>

                    <TextArea
                        label="Headline"
                        rows={3}
                        value={formData.headline}
                        onChange={(e) => handleChange('headline', e.target.value)}
                    />

                    <Input
                        label="Current Company"
                        value={formData.currentCompany || ''}
                        onChange={(e) => handleChange('currentCompany', e.target.value)}
                        placeholder="Company Name"
                    />

                    <Input
                        label="Location"
                        value={formData.location}
                        onChange={(e) => handleChange('location', e.target.value)}
                    />
                </div>

                {/* Scraped Data Sections */}
                <div className="mt-10 space-y-8">

                    {/* Experience */}
                    {formData.experiences && formData.experiences.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-[10px] font-bold text-foreground-subtle uppercase tracking-widest">Experience</h4>
                                <span className="text-[10px] bg-white/5 text-foreground-muted px-2 py-0.5 rounded-full font-mono">{formData.experiences.length}</span>
                            </div>
                            <div className="space-y-3 relative before:absolute before:left-[19px] before:top-3 before:bottom-3 before:w-[1px] before:bg-white/5">
                                {formData.experiences.map((exp: any, i: number) => (
                                    <div key={i} className="pl-10 relative group">
                                        <div className="absolute left-[15px] top-[9px] w-[9px] h-[9px] rounded-full bg-bg-deep border border-border-subtle group-hover:bg-accent group-hover:border-accent transition-colors duration-300 z-10 shadow-[0_0_0_4px_rgba(2,2,3,1)]"></div>

                                        <Card variant="ghost" className="p-3 -ml-3 hover:bg-white/[0.03] border-transparent hover:border-white/5 transition-all">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-foreground leading-snug">{exp.title}</span>
                                                <span className="text-xs text-accent-bright mt-0.5">{exp.company}</span>
                                                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-foreground-subtle font-mono">
                                                    <span>{exp.dates}</span>
                                                </div>
                                            </div>
                                        </Card>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Education */}
                    {formData.educations && formData.educations.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-[10px] font-bold text-foreground-subtle uppercase tracking-widest">Education</h4>
                                <span className="text-[10px] bg-white/5 text-foreground-muted px-2 py-0.5 rounded-full font-mono">{formData.educations.length}</span>
                            </div>
                            <div className="space-y-3">
                                {formData.educations.map((edu: any, i: number) => (
                                    <Card key={i} variant="ghost" className="p-3 border border-border-subtle/50 hover:border-border-subtle transition-all">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-foreground leading-snug">{edu.school}</span>
                                            <span className="text-xs text-foreground-muted mt-0.5">{edu.degree}</span>
                                            <span className="text-[10px] text-foreground-subtle mt-1.5 font-mono">{edu.dates}</span>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Skills */}
                    {formData.skills && formData.skills.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-[10px] font-bold text-foreground-subtle uppercase tracking-widest">Skills</h4>
                                <span className="text-[10px] bg-white/5 text-foreground-muted px-2 py-0.5 rounded-full font-mono">{formData.skills.length}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {formData.skills.slice(0, 15).map((skill, i) => (
                                    <span key={i} className="text-[10px] text-foreground-muted bg-white/[0.03] px-2 py-1 rounded border border-border-subtle hover:border-accent/30 hover:text-foreground transition-colors cursor-default">
                                        {skill}
                                    </span>
                                ))}
                                {formData.skills.length > 15 && (
                                    <span className="text-[10px] text-foreground-subtle py-1 pl-1 font-mono">+{formData.skills.length - 15}</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-border-subtle bg-bg-base/95 backdrop-blur z-20">
                <Button
                    size="lg"
                    onClick={() => {
                        console.log('[Lumina] Sidebar: Add button clicked');
                        onSave();
                    }}
                    isLoading={isLoading}
                    className="w-full shadow-glow hover:shadow-card-hover transition-all duration-300"
                >
                    Add to Lumina
                </Button>
            </div>
        </div>
    );
};
