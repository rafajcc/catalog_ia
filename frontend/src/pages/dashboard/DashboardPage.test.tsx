import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from './DashboardPage';

var mockApi: any;

jest.mock('../../services/api-service', () => ({
  getApiService: () => mockApi
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    mockApi = {
      getSystemStatus: jest.fn().mockResolvedValue({ success: true, message: 'Online' }),
      uploadCSV: jest.fn(),
      parseCSV: jest.fn(),
      uploadImages: jest.fn(),
      selectImageFolder: jest.fn(),
      getConfiguration: jest.fn().mockResolvedValue({ success: true }),
      validateProducts: jest.fn(),
      getValidationResults: jest.fn(),
      matchImages: jest.fn(),
      getImageMatchingResults: jest.fn(),
      generateTextSuggestions: jest.fn(),
      getTextSuggestions: jest.fn(),
      createSyncSession: jest.fn(),
      startSync: jest.fn(),
      getSyncResults: jest.fn(),
      getReviewState: jest.fn(),
      updateReviewState: jest.fn(),
      applyReviewChanges: jest.fn(),
      batchReviewAction: jest.fn(),
      exportReviewState: jest.fn()
    };
  });

  it('shows the system status in the header', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Online'));
  });

  it('shows Offline when the status request fails', async () => {
    mockApi.getSystemStatus.mockRejectedValue(new Error('down'));
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Offline'));
  });

  it('renders the upload section by default', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Data upload')).toBeInTheDocument();
  });

  it('blocks data steps until a CSV has been uploaded', async () => {
    render(<DashboardPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validation' }));

    expect(screen.getByText('Upload a CSV first to enable this step.')).toBeInTheDocument();
  });

  it('enables data steps after a CSV upload provides a data id', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });
    mockApi.validateProducts.mockResolvedValue({
      success: true,
      data: { products: [{ id: 'p1', name: 'Alpha', validation_errors: [] }] }
    });
    render(<DashboardPage />);

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), new File(['a,b'], 'p.csv'));
    await user.click(screen.getByRole('button', { name: /Upload and process CSV/ }));

    await waitFor(() =>
      expect(screen.getAllByText(/Data id: data-1/).length).toBeGreaterThan(0)
    );

    await user.click(screen.getByRole('button', { name: 'Validation' }));
    await user.click(await screen.findByRole('button', { name: 'Validate products' }));
    expect(await screen.findByText('1 total')).toBeInTheDocument();
  });
});
