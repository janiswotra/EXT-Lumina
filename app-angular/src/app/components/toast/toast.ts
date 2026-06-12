import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    <div [class]="containerClass">
      <div class="mr-3 text-xl">{{ type === 'success' ? '✓' : '⚠' }}</div>
      <div class="font-medium text-base">{{ message }}</div>
      <button (click)="close.emit()" class="ml-4 hover:opacity-75">✕</button>
    </div>
  `,
})
export class Toast implements OnInit, OnDestroy {
  @Input() message = '';
  @Input() type: 'success' | 'error' = 'success';
  @Output() close = new EventEmitter<void>();

  private timer?: ReturnType<typeof setTimeout>;

  get containerClass(): string {
    const bg =
      this.type === 'success'
        ? 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]'
        : 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]';
    return `fixed bottom-5 right-5 z-[2147483647] flex items-center px-4 py-3 rounded-lg shadow-lg border ${bg} transition-all transform animate-fade-in-up`;
  }

  ngOnInit(): void {
    this.timer = setTimeout(() => this.close.emit(), 4000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
