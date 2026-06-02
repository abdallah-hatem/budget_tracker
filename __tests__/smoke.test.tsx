import React from 'react';
import { Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';

function StyledHello() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-lg font-bold text-black">Budget Tracker</Text>
    </View>
  );
}

describe('NativeWind smoke test', () => {
  it('renders a className-styled Text and mounts it', () => {
    render(<StyledHello />);
    expect(screen.getByText('Budget Tracker')).toBeOnTheScreen();
  });
});
