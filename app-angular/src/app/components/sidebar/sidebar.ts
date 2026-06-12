import { Component, EventEmitter, Input, NgZone, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Button } from '../button/button';
import { PickerModal, PickerOption } from '../ui/picker-modal';
import { CollapsibleSection } from '../collapsible-section/collapsible-section';
import { CandidateProfile, Job, List, Stage } from '../../core/types';
import { ENVIRONMENTS } from '../../core/constants';
import { ExtensionApiService } from '../../core/services/extension-api.service';
import { assetUrl } from '../../core/utils/assets';

type LowField = 'headline' | 'location' | 'currentCompany' | 'jobTitle';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [Button, PickerModal, CollapsibleSection],
  templateUrl: './sidebar.html',
})
export class Sidebar implements OnChanges {
  @Input() isOpen = false;
  @Input() data!: CandidateProfile;
  @Input() isLoading = false;
  @Input() isExisting = false;
  @Input() onUpdate?: (data: CandidateProfile) => void;
  @Input() onSave!: (jobId?: string, stageId?: string, listId?: string) => Promise<boolean>;
  @Input() onDisconnect?: () => void;
  @Output() close = new EventEmitter<void>();

  readonly logoUrl = assetUrl('icons/icon-32.png');

  activeEnvId: string = ENVIRONMENTS[0].id;
  activeEnvLabel: string = ENVIRONMENTS[0].label;
  formData!: CandidateProfile;
  isSuccess = false;

  jobs: Job[] = [];
  stages: Stage[] = [];
  lists: List[] = [];
  selectedJob: Job | null = null;
  selectedStage: Stage | null = null;
  selectedList: List | null = null;
  loadingJobs = false;
  loadingStages = false;
  loadingLists = false;

  showJobPicker = false;
  showStagePicker = false;
  showListPicker = false;

  constructor(
    private readonly api: ExtensionApiService,
    private readonly zone: NgZone,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.formData = { ...this.data };
    }
    if (changes['isOpen'] && this.isOpen) {
      void this.onOpen();
    }
  }

  private async onOpen(): Promise<void> {
    const env = await this.api.getActiveEnv();
    this.activeEnvId = env.id;
    this.activeEnvLabel = env.label;
    await this.loadMetadata(true);
  }

  async loadMetadata(forceRefresh = true): Promise<void> {
    await Promise.all([
      this.fetchJobs(forceRefresh),
      this.fetchLists(forceRefresh),
      this.fetchStages(forceRefresh),
    ]);
  }

  async fetchJobs(forceRefresh = false): Promise<void> {
    this.loadingJobs = true;
    this.jobs = await this.api.getJobs(this.activeEnvId, forceRefresh);
    this.loadingJobs = false;
  }

  async fetchStages(forceRefresh = false): Promise<void> {
    this.loadingStages = true;
    this.stages = await this.api.getStages(this.activeEnvId, undefined, forceRefresh);
    this.loadingStages = false;
  }

  async fetchLists(forceRefresh = false): Promise<void> {
    this.loadingLists = true;
    this.lists = await this.api.getLists(this.activeEnvId, forceRefresh);
    this.loadingLists = false;
  }

  async fetchStagesForJob(jobId: string): Promise<void> {
    this.selectedStage = null;
    this.loadingStages = true;
    this.stages = await this.api.getStages(this.activeEnvId, jobId, true);
    this.loadingStages = false;
    this.selectedStage = this.stages.length > 0 ? this.stages[0] : null;
  }

  get jobOptions(): PickerOption[] {
    return this.jobs.map((j) => ({ id: j.id, label: j.title, sublabel: j.company || undefined }));
  }
  get stageOptions(): PickerOption[] {
    return this.stages.map((s) => ({ id: s.id, label: s.name, color: s.color }));
  }
  get listOptions(): PickerOption[] {
    return this.lists.map((l) => ({
      id: l.id,
      label: l.name,
      sublabel: l.count !== undefined ? `${l.count} candidates` : undefined,
    }));
  }

  get lowConfidenceFields(): LowField[] {
    return this.formData?.parseConfidence?.lowFields ?? [];
  }
  get showConfidenceWarning(): boolean {
    return this.lowConfidenceFields.length > 0;
  }
  get lowConfidenceLabel(): string {
    return this.lowConfidenceFields
      .map((f) => (f === 'currentCompany' ? 'company' : f === 'jobTitle' ? 'job title' : f))
      .join(', ');
  }
  get initials(): string {
    return `${this.formData?.firstName?.[0] ?? ''}${this.formData?.lastName?.[0] ?? ''}`;
  }

  get envBadgeClass(): string {
    const base = 'text-xs font-medium px-2 py-0.5 rounded-full';
    return `${base} ${
      this.activeEnvId === 'prod'
        ? 'bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]'
        : 'bg-[#fef3c7] text-[#92400e] border border-[#fde68a]'
    }`;
  }
  get statusPillClass(): string {
    const base = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors';
    return `${base} ${this.isExisting ? 'bg-[#eff6ff] border-[#bfdbfe]' : 'bg-[#fffbeb] border-[#fde68a]'}`;
  }
  get statusDotClass(): string {
    return `w-2 h-2 rounded-full animate-pulse ${this.isExisting ? 'bg-[#2563eb]' : 'bg-[#d97706]'}`;
  }
  get statusTextClass(): string {
    return `text-sm font-medium ${this.isExisting ? 'text-[#1e40af]' : 'text-[#92400e]'}`;
  }
  get saveButtonClass(): string {
    return `w-full py-4 text-lg shadow-lg ${this.isSuccess ? 'bg-[#059669] hover:bg-[#047857]' : ''}`;
  }

  valueTextClass(hasValue: unknown): string {
    return `text-base font-medium ${hasValue ? 'text-[#181c25]' : 'text-[#7e8799]'}`;
  }

  selectorButtonClass(color: 'primary' | 'secondary'): string {
    return `w-full flex items-center justify-between px-4 py-4 rounded-xl border transition-all hover:bg-[#f5f7fa] active:scale-[0.99] ${
      color === 'primary'
        ? 'bg-[#eff6ff] border-[#bfdbfe] hover:border-[#93c5fd]'
        : 'bg-[#fafbfc] border-[#dde1e8] hover:border-[#c5cad4]'
    }`;
  }

  handleChange(field: keyof CandidateProfile, value: string): void {
    const updated = { ...this.formData, [field]: value } as CandidateProfile;
    if ((field === 'headline' || field === 'location' || field === 'currentCompany') && updated.parseConfidence) {
      const fieldKey = field as LowField;
      const nextLowFields = updated.parseConfidence.lowFields.filter((f) => f !== fieldKey);
      updated.parseConfidence = {
        ...updated.parseConfidence,
        [fieldKey]: 'high',
        lowFields: nextLowFields,
        overall: nextLowFields.length > 0 ? 'medium' : 'high',
      };
    }
    this.formData = updated;
    this.onUpdate?.(updated);
  }

  onJobSelect(opt: PickerOption): void {
    this.selectedJob = this.jobs.find((j) => j.id === opt.id) || null;
    if (this.selectedJob) void this.fetchStagesForJob(this.selectedJob.id);
  }
  onStageSelect(opt: PickerOption): void {
    this.selectedStage = this.stages.find((s) => s.id === opt.id) || null;
  }
  onListSelect(opt: PickerOption): void {
    this.selectedList = this.lists.find((l) => l.id === opt.id) || null;
  }

  async handleSaveClick(): Promise<void> {
    const didSave = await this.onSave(
      this.selectedJob?.id || undefined,
      this.selectedStage?.id || undefined,
      this.selectedList?.id || undefined,
    );
    if (didSave) {
      this.isSuccess = true;
      setTimeout(() => this.zone.run(() => (this.isSuccess = false)), 3000);
    }
  }
}
