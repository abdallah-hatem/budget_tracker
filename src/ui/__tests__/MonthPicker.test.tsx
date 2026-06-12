import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MonthPicker } from '../MonthPicker';
import { currentMonthKey } from '../../features/dashboard/monthRange';

const value = { year: 2026, month: 5 }; // June 2026

function setup(locale: 'en' | 'ar' = 'en') {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const api = render(
    <MonthPicker visible value={value} onSelect={onSelect} onClose={onClose} locale={locale} />,
  );
  return { api, onSelect, onClose };
}

it('selects a month in the shown year', () => {
  const { api, onSelect } = setup();
  fireEvent.press(api.getByTestId('month-picker-2026-0')); // January 2026
  expect(onSelect).toHaveBeenCalledWith({ year: 2026, month: 0 });
});

it('steps the year and selects within it', () => {
  const { api, onSelect } = setup();
  fireEvent.press(api.getByTestId('month-picker-next-year')); // → 2027
  fireEvent.press(api.getByTestId('month-picker-2027-5')); // June 2027
  expect(onSelect).toHaveBeenCalledWith({ year: 2027, month: 5 });
});

it('steps back a year', () => {
  const { api, onSelect } = setup();
  fireEvent.press(api.getByTestId('month-picker-prev-year')); // → 2025
  fireEvent.press(api.getByTestId('month-picker-2025-11')); // December 2025
  expect(onSelect).toHaveBeenCalledWith({ year: 2025, month: 11 });
});

it('"This month" jumps to the current month', () => {
  const { api, onSelect } = setup();
  fireEvent.press(api.getByTestId('month-picker-today'));
  expect(onSelect).toHaveBeenCalledWith(currentMonthKey());
});

it('renders Arabic month labels', () => {
  const { api } = setup('ar');
  expect(api.getByText('يناير')).toBeTruthy();
  expect(api.getByText('هذا الشهر')).toBeTruthy();
});
