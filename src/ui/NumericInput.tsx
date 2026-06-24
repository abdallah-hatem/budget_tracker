import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { sanitizeNumericInput, formatNumericInput } from '../lib/numberInput';

export interface NumericInputProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> {
  /** Raw numeric string (digits + optional '.', NO grouping) — parseFloat-ready. */
  value: string;
  /** Receives the sanitized RAW string (no commas). */
  onChangeValue: (raw: string) => void;
  /** Allow a decimal point (default true). false = integers only. */
  decimal?: boolean;
}

/**
 * TextInput that displays thousand separators as you type while keeping the raw
 * value (no commas) in the parent's state. Drop-in for amount/number fields.
 */
export function NumericInput({ value, onChangeValue, decimal = true, ...rest }: NumericInputProps) {
  return (
    <TextInput
      {...rest}
      value={formatNumericInput(value)}
      onChangeText={(t) => onChangeValue(sanitizeNumericInput(t, decimal))}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
    />
  );
}
