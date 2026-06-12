import { Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { cn } from '../../core/utils/cn';

let inputIdCounter = 0;

@Component({
  selector: 'app-input',
  standalone: true,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => InputComponent), multi: true },
  ],
  template: `
    <div class="flex flex-col gap-1 w-full">
      @if (label) {
        <label [attr.for]="inputId" class="text-sm font-medium text-[#4a5364] tracking-[-0.02em] ml-0.5">
          {{ label }}
        </label>
      }
      <div [class]="wrapperClass">
        <ng-content select="[startAdornment]"></ng-content>
        <input
          [id]="inputId"
          [type]="type"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [value]="value"
          [attr.aria-invalid]="error || null"
          (input)="onInput($event)"
          (blur)="onTouched()"
          [class]="inputClass"
        />
        <ng-content select="[endAdornment]"></ng-content>
      </div>
    </div>
  `,
})
export class InputComponent implements ControlValueAccessor {
  @Input() label?: string;
  @Input() error = false;
  @Input() type = 'text';
  @Input() placeholder = '';
  @Input() extraClass = '';

  readonly inputId = `yena-input-${++inputIdCounter}`;
  value = '';
  disabled = false;

  private onChange: (v: string) => void = () => {};
  onTouched: () => void = () => {};

  get wrapperClass(): string {
    return cn(
      'relative flex items-center gap-1.5 w-full',
      'bg-white rounded-lg h-[36px]',
      'shadow-[inset_0px_0px_0px_1px_#dde1e8]',
      'transition-shadow duration-140',
      'hover:shadow-[inset_0px_0px_0px_1px_#c5cad4]',
      'focus-within:shadow-[inset_0px_0px_0px_1px_#2563eb]',
      this.error ? 'shadow-[inset_0px_0px_0px_1px_#dc2626]' : '',
    );
  }

  get inputClass(): string {
    return cn(
      'flex-1 w-full h-full bg-transparent',
      'text-base font-medium tracking-[-0.02em] text-[#181c25]',
      'placeholder:text-[#7e8799]',
      'px-2.5 outline-none border-none',
      this.extraClass,
    );
  }

  onInput(e: Event): void {
    this.value = (e.target as HTMLInputElement).value;
    this.onChange(this.value);
  }

  writeValue(v: string): void {
    this.value = v ?? '';
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean): void {
    this.disabled = d;
  }
}

@Component({
  selector: 'app-textarea',
  standalone: true,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TextAreaComponent), multi: true },
  ],
  template: `
    <div class="flex flex-col gap-1 w-full">
      @if (label) {
        <label [attr.for]="inputId" class="text-sm font-medium text-[#4a5364] tracking-[-0.02em] ml-0.5">
          {{ label }}
        </label>
      }
      <div [class]="wrapperClass">
        <textarea
          [id]="inputId"
          [rows]="rows"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [value]="value"
          [attr.aria-invalid]="error || null"
          (input)="onInput($event)"
          (blur)="onTouched()"
          [class]="textareaClass"
        ></textarea>
      </div>
    </div>
  `,
})
export class TextAreaComponent implements ControlValueAccessor {
  @Input() label?: string;
  @Input() error = false;
  @Input() placeholder = '';
  @Input() rows = 3;
  @Input() extraClass = '';

  readonly inputId = `yena-textarea-${++inputIdCounter}`;
  value = '';
  disabled = false;

  private onChange: (v: string) => void = () => {};
  onTouched: () => void = () => {};

  get wrapperClass(): string {
    return cn(
      'relative w-full',
      'bg-white rounded-lg',
      'shadow-[inset_0px_0px_0px_1px_#dde1e8]',
      'transition-shadow duration-140',
      'hover:shadow-[inset_0px_0px_0px_1px_#c5cad4]',
      'focus-within:shadow-[inset_0px_0px_0px_1px_#2563eb]',
      this.error ? 'shadow-[inset_0px_0px_0px_1px_#dc2626]' : '',
    );
  }

  get textareaClass(): string {
    return cn(
      'w-full bg-transparent resize-none',
      'text-base font-medium tracking-[-0.02em] text-[#181c25]',
      'placeholder:text-[#7e8799]',
      'px-2.5 py-2 outline-none border-none leading-relaxed',
      this.extraClass,
    );
  }

  onInput(e: Event): void {
    this.value = (e.target as HTMLTextAreaElement).value;
    this.onChange(this.value);
  }

  writeValue(v: string): void {
    this.value = v ?? '';
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean): void {
    this.disabled = d;
  }
}
