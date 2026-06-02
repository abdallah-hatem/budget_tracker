import React from 'react';
import { View, type ViewProps } from 'react-native';

export interface CardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Card — surface-colored rounded container.
 * bg-surface, rounded-[20px], padding 16.
 */
export function Card({ children, className = '', style, ...rest }: CardProps) {
  return (
    <View
      className={`bg-surface rounded-[20px] p-4 ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </View>
  );
}
