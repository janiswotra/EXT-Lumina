import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { cn } from '../../core/utils/cn';

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
  color?: string;
}

@Component({
  selector: 'app-picker-modal',
  standalone: true,
  template: `
    @if (isOpen) {
      <div
        class="absolute inset-0 z-50 flex flex-col pointer-events-auto"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/30 backdrop-blur-sm" (click)="close.emit()"></div>

        <!-- Modal -->
        <div
          class="relative flex-1 flex flex-col m-4 mt-16 bg-white rounded-xl shadow-[0px_0px_0px_1px_#dde1e8,0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] overflow-hidden animate-fade-in"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-[#e8ebf1]">
            <h3 class="text-base font-semibold tracking-[-0.02em] text-[#181c25]">{{ title }}</h3>
            <button
              (click)="close.emit()"
              class="w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/[0.04] text-[#4a5364] hover:text-[#181c25] transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Search -->
          <div class="px-3 py-2.5 border-b border-[#e8ebf1]">
            <div class="relative flex items-center">
              <svg class="absolute left-2.5 w-4 h-4 text-[#4a5364]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                #searchInput
                type="text"
                [value]="search"
                (input)="onSearch($event)"
                [placeholder]="searchPlaceholder"
                class="w-full h-[36px] pl-8 pr-3 bg-white rounded-lg text-base font-medium text-[#181c25] placeholder:text-[#7e8799] shadow-[inset_0px_0px_0px_1px_#dde1e8] focus:shadow-[inset_0px_0px_0px_1px_#2563eb] focus:outline-none transition-shadow duration-140"
              />
            </div>
          </div>

          <!-- Options List -->
          <div class="flex-1 overflow-y-auto p-3 space-y-2">
            @if (isLoading) {
              <div class="flex items-center justify-center py-8">
                <svg class="animate-spin w-5 h-5 text-[#4a5364]" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              </div>
            } @else if (filteredOptions.length === 0) {
              <div class="text-center py-8 text-base font-medium tracking-[-0.02em] text-[#4a5364]">
                {{ emptyMessage }}
              </div>
            } @else {
              @for (option of filteredOptions; track option.id) {
                <button (click)="choose(option)" [class]="optionClass(option)">
                  @if (option.color) {
                    <span class="w-3 h-3 mt-1.5 rounded-full shrink-0" [style.backgroundColor]="option.color"></span>
                  } @else {
                    <span class="w-2.5 h-2.5 mt-2 rounded-full bg-[#2563eb] shrink-0"></span>
                  }

                  <div class="flex-1 min-w-0">
                    <p class="text-[15px] leading-[1.32] font-semibold text-[#181c25] break-words pr-1">{{ option.label }}</p>
                    @if (option.sublabel) {
                      <p class="mt-1 text-[13px] leading-[1.4] font-medium text-[#687182] break-words pr-1">{{ option.sublabel }}</p>
                    }
                  </div>

                  @if (selectedId === option.id) {
                    <svg class="w-4 h-4 text-[#2563eb] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  }
                </button>
              }
            }
          </div>

          <!-- Footer hint -->
          <div class="px-4 py-2.5 border-t border-[#e8ebf1] flex items-center justify-end text-sm font-medium text-[#4a5364]">
            <span>ESC to close</span>
          </div>
        </div>
      </div>
    }
  `,
})
export class PickerModal implements OnChanges {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() options: PickerOption[] = [];
  @Input() selectedId?: string;
  @Input() searchPlaceholder = 'Search...';
  @Input() emptyMessage = 'No items found';
  @Input() isLoading = false;
  @Output() close = new EventEmitter<void>();
  @Output() select = new EventEmitter<PickerOption>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  search = '';

  get filteredOptions(): PickerOption[] {
    const q = this.search.toLowerCase();
    return this.options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sublabel?.toLowerCase().includes(q) ?? false),
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (this.isOpen) {
        setTimeout(() => this.searchInput?.nativeElement.focus(), 50);
      } else {
        this.search = '';
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.close.emit();
  }

  onSearch(e: Event): void {
    this.search = (e.target as HTMLInputElement).value;
  }

  choose(option: PickerOption): void {
    this.select.emit(option);
    this.close.emit();
  }

  optionClass(option: PickerOption): string {
    return cn(
      'w-full flex items-start min-h-[54px] gap-3 px-4 py-3 rounded-xl text-left transition-all duration-140',
      this.selectedId === option.id
        ? 'bg-[#eff6ff] border border-[#bfdbfe] text-[#181c25]'
        : 'hover:bg-[#f5f7fa] text-[#181c25]',
    );
  }
}
