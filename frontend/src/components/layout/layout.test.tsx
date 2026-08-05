import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppHeader from './AppHeader';
import TabNav, { TabItem } from './TabNav';
import { renderWithI18n } from '../../test-utils';

describe('AppHeader', () => {
  it('shows the application title and status', () => {
    renderWithI18n(<AppHeader status="Online" />, 'en');
    expect(screen.getByText('CatalogIA')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Status: Online');
  });

  it('shows an offline status in red', () => {
    renderWithI18n(<AppHeader status="Offline" />, 'en');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Offline');
    expect(status.querySelector('.chip')?.className).toContain('error');
  });

  it('switches the UI language via the selector', async () => {
    renderWithI18n(<AppHeader status="Online" />, 'es');
    expect(screen.getByRole('status')).toHaveTextContent('En línea');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'EN' }));

    expect(screen.getByRole('status')).toHaveTextContent('Status: Online');
  });
});

describe('TabNav', () => {
  const tabs: TabItem[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'sync', label: 'Sync' }
  ];

  it('renders all tabs and marks the active one', () => {
    render(<TabNav tabs={tabs} active="upload" onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument();
  });

  it('notifies when a tab is selected', async () => {
    const onChange = jest.fn();
    render(<TabNav tabs={tabs} active="upload" onChange={onChange} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sync' }));

    expect(onChange).toHaveBeenCalledWith('sync');
  });
});
