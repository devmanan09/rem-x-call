import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Reports from '../../pages/Reports';
import { describe, it, expect } from 'vitest';

// Fix ResizeObserver issue for Recharts running in Vitest
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Reports Component', () => {
  it('renders the page heading', () => {
    render(<Reports />, { wrapper: BrowserRouter });
    expect(screen.getByRole('heading', { level: 1, name: /reports & analytics/i })).toBeInTheDocument();
  });

  it('renders Call Statistics and Generated Revenue sections', () => {
    render(<Reports />, { wrapper: BrowserRouter });
    expect(screen.getByText('Call Statistics')).toBeInTheDocument();
    expect(screen.getByText('Generated Revenue')).toBeInTheDocument();
  });

  it('renders Contacts Overview label', () => {
    render(<Reports />, { wrapper: BrowserRouter });
    expect(screen.getByText('Contacts Overview')).toBeInTheDocument();
  });
});
