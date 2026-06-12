import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CandidateProfile } from '../../core/types';
import { assetUrl } from '../../core/utils/assets';

@Component({
  selector: 'app-preview',
  standalone: true,
  templateUrl: './preview.html',
})
export class Preview {
  @Input() data!: CandidateProfile;
  @Input() isLoading = false;
  @Input() isExisting = false;
  @Input() isFetching = false;
  @Output() add = new EventEmitter<void>();

  readonly logoUrl = assetUrl('icons/icon-32.png');

  get showSkeleton(): boolean {
    return this.isFetching || (!this.data?.firstName && !this.data?.lastName);
  }

  get initials(): string {
    return `${this.data?.firstName?.[0] ?? ''}${this.data?.lastName?.[0] ?? ''}`;
  }

  get avatarClass(): string {
    return `w-16 h-16 rounded-2xl overflow-hidden border border-[#e8ebf1] ${
      this.showSkeleton ? 'animate-shimmer bg-black/[0.04]' : 'bg-[#f5f7fa]'
    }`;
  }

  get statusBadgeClass(): string {
    const base = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium tracking-[-0.02em]';
    return `${base} ${
      this.isExisting
        ? 'bg-[#ecfdf5] border border-[#a7f3d0] text-[#065f46]'
        : 'bg-[#fdf2f8] border border-[#fbcfe8] text-[#9d174d]'
    }`;
  }

  get ctaButtonClass(): string {
    const base =
      'w-full h-[40px] rounded-lg text-base font-semibold tracking-[-0.02em] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';
    return `${base} ${
      this.isExisting
        ? 'bg-white text-[#181c25] shadow-[0px_1px_2px_rgba(0,0,0,0.05),inset_0px_0px_0px_1px_#dde1e8] hover:bg-[#f5f7fa]'
        : 'bg-[#ff6a26] text-white shadow-[0px_1px_3px_rgba(255,106,38,0.2),0px_1px_2px_rgba(0,0,0,0.05)] hover:bg-[#e85814]'
    }`;
  }
}
