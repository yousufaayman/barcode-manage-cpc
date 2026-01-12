export type PrintPlacement = {
  key: string;
  label: string;
};

export const DEFAULT_PRINT_PLACEMENTS: PrintPlacement[] = [
  { key: 'front_print', label: 'Front Print' },
  { key: 'back_print', label: 'Back Print' },
  { key: 'left_arm_print', label: 'Left Arm Print' },
  { key: 'right_arm_print', label: 'Right Arm Print' },
];






