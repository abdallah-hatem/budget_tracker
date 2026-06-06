import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ManualEntrySheet } from './ManualEntrySheet';

describe('ManualEntrySheet', () => {
  it('submits the entered values on Add (no AI involved)', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <ManualEntrySheet locale="en" onSubmit={onSubmit} onCancel={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId('manual-amount'), '50');
    fireEvent.press(getByTestId('manual-cat-transport'));
    fireEvent.changeText(getByTestId('manual-note'), 'taxi');
    fireEvent.press(getByTestId('manual-add'));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'expense',
      amount: 50,
      category_slug: 'transport',
      note: 'taxi',
    });
  });

  it('blocks submit and shows an error when the amount is empty', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <ManualEntrySheet locale="en" onSubmit={onSubmit} onCancel={jest.fn()} />,
    );
    fireEvent.press(getByTestId('manual-add'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(getByTestId('manual-error')).toBeTruthy();
  });

  it('blocks submit for a non-positive amount', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <ManualEntrySheet locale="en" onSubmit={onSubmit} onCancel={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId('manual-amount'), '0');
    fireEvent.press(getByTestId('manual-add'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('switches to income categories when the type toggles', () => {
    const onSubmit = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ManualEntrySheet locale="en" onSubmit={onSubmit} onCancel={jest.fn()} />,
    );
    // Expense category is shown by default.
    expect(getByTestId('manual-cat-food')).toBeTruthy();
    fireEvent.press(getByTestId('manual-type-income'));
    // Income categories replace the expense ones.
    expect(getByTestId('manual-cat-salary')).toBeTruthy();
    expect(queryByTestId('manual-cat-food')).toBeNull();
    // The default category follows the type, so a submit reflects income.
    fireEvent.changeText(getByTestId('manual-amount'), '1000');
    fireEvent.press(getByTestId('manual-add'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'income', amount: 1000 }),
    );
  });

  it('cancels without submitting', () => {
    const onCancel = jest.fn();
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <ManualEntrySheet locale="en" onSubmit={onSubmit} onCancel={onCancel} />,
    );
    fireEvent.press(getByTestId('manual-cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
