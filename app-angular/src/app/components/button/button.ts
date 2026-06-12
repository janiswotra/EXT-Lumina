import { Component, Input } from '@angular/core';
import { cn } from '../../core/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'xs' | 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  host: { style: 'display: contents' },
  template: `
    <button [class]="classes" [disabled]="isLoading || disabled" [attr.type]="type">
      @if (isLoading) {
        <svg
          class="animate-spin h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      }
      <ng-content></ng-content>
    </button>
  `,
})
export class Button {
  @Input() variant: Variant = 'primary';
  @Input() size: Size = 'md';
  @Input() fullWidth = false;
  @Input() isLoading = false;
  @Input() disabled = false;
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() extraClass = '';

  private readonly base = cn(
    'inline-flex items-center justify-center gap-1.5',
    'font-medium tracking-[-0.02em]',
    'transition-all duration-200',
    'focus:outline-none focus-visible:outline focus-visible:outline-[#ff6a26] focus-visible:outline-1 focus-visible:outline-offset-1',
    'disabled:opacity-40 disabled:cursor-not-allowed',
    'active:scale-[0.98]',
    'shrink-0',
  );

  private readonly variants: Record<Variant, string> = {
    primary: cn(
      'bg-[#ff6a26] text-white',
      'shadow-[0px_1px_3px_rgba(255,106,38,0.2),0px_1px_2px_rgba(0,0,0,0.05)]',
      'hover:bg-[#e85814]',
    ),
    secondary: cn(
      'bg-white text-[#181c25]',
      'shadow-[0px_1px_2px_rgba(0,0,0,0.05),inset_0px_0px_0px_1px_#dde1e8]',
      'hover:bg-[#f5f7fa]',
    ),
    ghost: cn('bg-transparent text-[#4a5364]', 'hover:bg-black/[0.04] hover:text-[#181c25]'),
    danger: cn(
      'bg-[#dc2626] text-white',
      'shadow-[0px_1px_3px_rgba(220,38,38,0.15),0px_1px_2px_rgba(0,0,0,0.05)]',
      'hover:bg-[#ef4444]',
    ),
  };

  private readonly sizes: Record<Size, string> = {
    xs: 'px-2 py-0.5 text-sm rounded-md h-[22px]',
    sm: 'px-3 py-1 text-sm rounded-lg h-[30px]',
    md: 'px-3 py-1.5 text-base rounded-lg h-[36px]',
    lg: 'px-4 py-2 text-base rounded-[9px] h-[40px]',
  };

  get classes(): string {
    return cn(
      this.base,
      this.variants[this.variant],
      this.sizes[this.size],
      this.fullWidth ? 'w-full' : '',
      this.extraClass,
    );
  }
}
