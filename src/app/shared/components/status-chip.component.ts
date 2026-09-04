import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ChipTone = 'active' | 'inactive' | 'prospect';

@Component({
  selector: 'app-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [class]="'chip--' + tone()">{{ label() }}</span>`,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
      border: 1px solid currentcolor;
    }

    .chip::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentcolor;
    }

    .chip--active {
      color: var(--pc-status-active);
    }

    .chip--inactive {
      color: var(--pc-status-inactive);
    }

    .chip--prospect {
      color: var(--pc-status-prospect);
    }
  `,
})
export class StatusChipComponent {
  readonly tone = input.required<ChipTone>();
  readonly text = input<string | null>(null);

  protected readonly label = computed(
    () => this.text() ?? this.tone().charAt(0).toUpperCase() + this.tone().slice(1),
  );
}
