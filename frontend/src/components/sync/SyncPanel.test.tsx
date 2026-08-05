import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SyncPanel from './SyncPanel';

var mockApi: any;

jest.mock('../../services/api-service', () => ({
  getApiService: () => mockApi
}));

describe('SyncPanel', () => {
  beforeEach(() => {
    mockApi = {
      createSyncSession: jest.fn(),
      startSync: jest.fn(),
      getSyncResults: jest.fn()
    };
  });

  it('creates a session and starts the sync', async () => {
    mockApi.createSyncSession.mockResolvedValue({
      success: true,
      session: { id: 's1', status: 'pending', dry_run: false, config: { batch_size: 10 }, plan: {} }
    });
    mockApi.startSync.mockResolvedValue({ success: true });
    render(<SyncPanel dataId="d1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    await waitFor(() =>
      expect(mockApi.createSyncSession).toHaveBeenCalledWith('d1', { batch_size: 10 })
    );
    expect(await screen.findByText('Session: s1')).toBeInTheDocument();
    expect(screen.getByText('Status: pending')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start sync' }));
    await waitFor(() => expect(mockApi.startSync).toHaveBeenCalledWith('s1'));
    expect(await screen.findByText('Sync started')).toBeInTheDocument();
  });

  it('loads results and summarizes completed/failed operations', async () => {
    mockApi.createSyncSession.mockResolvedValue({
      success: true,
      session: { id: 's1', status: 'completed', dry_run: false, config: { batch_size: 10 }, plan: {} }
    });
    mockApi.getSyncResults.mockResolvedValue({
      success: true,
      data: [
        { operation: 'create_product', status: 'completed', product_id: 'p1', retry_count: 0 },
        { operation: 'update_product', status: 'failed', product_id: 'p2', retry_count: 1 }
      ]
    });
    render(<SyncPanel dataId="d1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create session' }));
    await user.click(await screen.findByRole('button', { name: 'Get results' }));

    await waitFor(() => expect(mockApi.getSyncResults).toHaveBeenCalledWith('s1'));
    expect(await screen.findByText('1 completed')).toBeInTheDocument();
    expect(screen.getByText('1 failed')).toBeInTheDocument();
  });

  it('shows an error when creating the session fails', async () => {
    mockApi.createSyncSession.mockRejectedValue(new Error('no data available'));
    render(<SyncPanel dataId="d1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(await screen.findByText('no data available')).toBeInTheDocument();
  });
});
