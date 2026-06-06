import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SmsRulesSection } from '../SmsRulesSection';
import { listSmsRules, createSmsRule, deleteSmsRule } from '../api';

jest.mock('../api', () => ({
  listSmsRules: jest.fn(),
  createSmsRule: jest.fn(),
  deleteSmsRule: jest.fn(),
}));

const mockList = listSmsRules as unknown as jest.Mock;
const mockCreate = createSmsRule as unknown as jest.Mock;
const mockDelete = deleteSmsRule as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
});

it('shows the empty state when there are no rules', async () => {
  const { getByText } = render(<SmsRulesSection locale="en" />);
  await waitFor(() => expect(getByText('No rules yet.')).toBeTruthy());
});

it('adds a rule with the keyword, chosen category and note', async () => {
  mockCreate.mockResolvedValue({
    id: 'r1', keyword: 'VODAFONE', category_slug: 'bills', note: 'Phone', created_at: '',
  });
  const { getByTestId } = render(<SmsRulesSection locale="en" />);
  await waitFor(() => expect(mockList).toHaveBeenCalled());

  fireEvent.changeText(getByTestId('rule-keyword'), 'VODAFONE');
  fireEvent.press(getByTestId('rule-cat-bills'));
  fireEvent.changeText(getByTestId('rule-note'), 'Phone');
  fireEvent.press(getByTestId('rule-add'));

  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({
      keyword: 'VODAFONE',
      category_slug: 'bills',
      note: 'Phone',
    }),
  );
});

it('does NOT add a rule with an empty keyword (shows an error)', async () => {
  const { getByTestId, queryByTestId } = render(<SmsRulesSection locale="en" />);
  await waitFor(() => expect(mockList).toHaveBeenCalled());

  fireEvent.press(getByTestId('rule-add'));

  expect(mockCreate).not.toHaveBeenCalled();
  await waitFor(() => expect(queryByTestId('rule-error')).toBeTruthy());
});

it('deletes a rule', async () => {
  mockList.mockResolvedValue([
    { id: 'r1', keyword: 'UBER', category_slug: 'transport', note: null, created_at: '' },
  ]);
  mockDelete.mockResolvedValue(undefined);
  const { getByTestId } = render(<SmsRulesSection locale="en" />);

  await waitFor(() => expect(getByTestId('rule-r1')).toBeTruthy());
  fireEvent.press(getByTestId('rule-delete-r1'));

  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('r1'));
});
