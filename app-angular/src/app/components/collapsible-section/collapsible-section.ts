import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-collapsible-section',
  standalone: true,
  template: `
    <div class="border-t border-[#e8ebf1] pt-4">
      <button (click)="toggle()" class="w-full flex items-center justify-between mb-3 group cursor-pointer">
        <div class="flex items-center gap-2">
          <h4 class="text-sm font-semibold text-[#687182] uppercase tracking-wider group-hover:text-[#181c25] transition-colors">
            {{ title }}
          </h4>
          <span class="text-sm bg-[#f5f7fa] text-[#687182] px-2 py-0.5 rounded-full border border-[#e8ebf1]">{{ count }}</span>
        </div>
        <svg [class]="chevronClass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      @if (isExpanded) {
        <ng-content></ng-content>
      }
    </div>
  `,
})
export class CollapsibleSection implements OnInit {
  @Input() title = '';
  @Input() count = 0;
  @Input() defaultExpanded = false;

  isExpanded = false;

  ngOnInit(): void {
    this.isExpanded = this.defaultExpanded;
  }

  toggle(): void {
    this.isExpanded = !this.isExpanded;
  }

  get chevronClass(): string {
    return `w-4 h-4 text-[#687182] transition-transform duration-200 ${this.isExpanded ? 'rotate-180' : ''}`;
  }
}
