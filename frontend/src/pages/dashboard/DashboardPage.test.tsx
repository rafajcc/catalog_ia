import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from './DashboardPage';
import { renderWithI18n } from '../../test-utils';

var mockApi: any;

jest.mock('../../services/api-service', () => ({
  getApiService: () => mockApi
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    mockApi = {
      getSystemStatus: jest.fn().mockResolvedValue({ success: true, message: 'Online' }),
      getUploads: jest.fn().mockResolvedValue({ success: true, data: { csvs: [], images: [] } }),
      uploadCSV: jest.fn(),
      parseCSV: jest.fn(),
      uploadImages: jest.fn(),
      selectImageFolder: jest.fn(),
      deleteCsvUpload: jest.fn().mockResolvedValue({ success: true }),
      deleteImageUpload: jest.fn().mockResolvedValue({ success: true }),
      deleteAllCsvs: jest.fn().mockResolvedValue({ success: true }),
      deleteAllImages: jest.fn().mockResolvedValue({ success: true }),
      getConfiguration: jest.fn().mockResolvedValue({ success: true }),
      validateProducts: jest.fn(),
      getValidationResults: jest.fn(),
      matchImages: jest.fn(),
      getImageMatchingResults: jest.fn(),
      generateTextSuggestions: jest.fn(),
      getTextSuggestions: jest.fn(),
      getReviewState: jest.fn(),
      updateReviewState: jest.fn(),
      applyReviewChanges: jest.fn(),
      batchReviewAction: jest.fn(),
      exportReviewState: jest.fn()
    };
  });

  it('shows the system status in the header', async () => {
    renderWithI18n(<DashboardPage />, 'en');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Online'));
  });

  it('shows Offline when the status request fails', async () => {
    mockApi.getSystemStatus.mockRejectedValue(new Error('down'));
    renderWithI18n(<DashboardPage />, 'en');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Offline'));
  });

  it('renders the upload section by default', () => {
    renderWithI18n(<DashboardPage />, 'en');
    expect(screen.getByText('Data upload')).toBeInTheDocument();
  });

  it('opens the configuration view from the header settings button and keeps the tabs visible', async () => {
    renderWithI18n(<DashboardPage />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validation' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.queryByText('Configuration')).not.toBeInTheDocument();
    expect(screen.getByText('Data upload')).toBeInTheDocument();
  });

  it('disables the data tabs until a CSV has been uploaded', () => {
    renderWithI18n(<DashboardPage />, 'en');

    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Validation' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Images' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'AI' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
  });

  it('enables data steps after a CSV upload provides a data id', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });
    mockApi.validateProducts.mockResolvedValue({
      success: true,
      data: { products: [{ id: 'p1', name: 'Alpha', validation_errors: [] }] }
    });
    renderWithI18n(<DashboardPage />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), new File(['a,b'], 'p.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Validation' })).toBeEnabled());

    expect(screen.getByRole('button', { name: 'AI' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Validation' }));
    expect(screen.getByText('Loaded files (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show files' })).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Validate products' }));
    expect(await screen.findByText('1 total')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'AI' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();
  });

  it('auto-loads the stored validation when reopening the tab without upload changes', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });
    mockApi.validateProducts.mockResolvedValue({
      success: true,
      data: { products: [{ id: 'p1', name: 'Alpha', validation_errors: [] }] }
    });
    mockApi.getValidationResults.mockResolvedValue({
      success: true,
      data: { products: [{ id: 'p1', name: 'Alpha', validation_errors: [] }] }
    });
    renderWithI18n(<DashboardPage />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), new File(['a,b'], 'a.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validation' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Validation' }));
    await user.click(await screen.findByRole('button', { name: 'Validate products' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'AI' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await user.click(screen.getByRole('button', { name: 'Validation' }));

    await waitFor(() => expect(mockApi.getValidationResults).toHaveBeenCalledWith('data-1'));
    expect(await screen.findByText('1 total')).toBeInTheDocument();
  });

  it('does not auto-load old results after the uploaded files change', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });
    mockApi.validateProducts.mockResolvedValue({
      success: true,
      data: { products: [{ id: 'p1', name: 'Alpha', validation_errors: [] }] }
    });
    renderWithI18n(<DashboardPage />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), new File(['a,b'], 'a.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validation' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Validation' }));
    await user.click(await screen.findByRole('button', { name: 'Validate products' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'AI' })).toBeEnabled());
    expect(mockApi.getValidationResults).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), new File(['c,d'], 'b.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validation' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Validation' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validate products' })).toBeInTheDocument());

    expect(mockApi.getValidationResults).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'AI' })).toBeDisabled();
  });

  it('keeps a record of uploaded files across tab switches', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });
    mockApi.uploadImages.mockResolvedValue({ success: true });
    renderWithI18n(<DashboardPage />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), new File(['a,b'], 'catalog.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validation' })).toBeEnabled());

    await user.upload(screen.getByLabelText(/Product images/), [new File(['x'], 'img.jpg', { type: 'image/jpeg' })]);
    await user.click(screen.getByRole('button', { name: 'Upload images' }));
    await waitFor(() => expect(screen.getAllByText('(1 uploaded)')).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Validation' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(screen.getAllByText('(1 uploaded)')).toHaveLength(2);
    expect(screen.getByText('catalog.csv')).toBeInTheDocument();
    expect(screen.getByText('img.jpg')).toBeInTheDocument();
  });

  it('loads the list of uploaded files from the server on mount', async () => {
    mockApi.getUploads.mockResolvedValue({
      success: true,
      data: {
        csvs: [{ id: 'file-1', name: 'products.csv' }, { id: 'file-2', name: 'extras.csv' }],
        images: [{ id: 'a.jpg', name: 'a.jpg' }]
      }
    });
    renderWithI18n(<DashboardPage />, 'en');

    await waitFor(() => expect(screen.getByText('products.csv')).toBeInTheDocument());
    expect(screen.getByText('extras.csv')).toBeInTheDocument();
    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    expect(screen.getByText('(2 uploaded)')).toBeInTheDocument();
    expect(screen.getByText('(1 uploaded)')).toBeInTheDocument();
  });

  it('deletes a single uploaded CSV and refreshes the list', async () => {
    mockApi.getUploads
      .mockResolvedValueOnce({
        success: true,
        data: { csvs: [{ id: 'file-1', name: 'products.csv' }], images: [] }
      })
      .mockResolvedValueOnce({ success: true, data: { csvs: [], images: [] } });
    renderWithI18n(<DashboardPage />, 'en');

    await waitFor(() => expect(screen.getByText('products.csv')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete products.csv' }));

    expect(mockApi.deleteCsvUpload).toHaveBeenCalledWith('file-1');
    await waitFor(() => expect(screen.queryByText('products.csv')).not.toBeInTheDocument());
  });

  it('falls back to the first remaining CSV when the active file is deleted', async () => {
    mockApi.getUploads
      .mockResolvedValueOnce({
        success: true,
        data: {
          csvs: [
            { id: 'file-1', name: 'products.csv' },
            { id: 'file-2', name: 'extras.csv' }
          ],
          images: []
        }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          csvs: [
            { id: 'file-1', name: 'products.csv' },
            { id: 'file-2', name: 'extras.csv' }
          ],
          images: []
        }
      });
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-3' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'file-3' } });
    renderWithI18n(<DashboardPage />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), new File(['a,b'], 'new.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validation' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Delete new.csv' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Validation' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Validation' }));
    expect(screen.getByText('Loaded files (2)')).toBeInTheDocument();
  });

  it('deletes a single uploaded image and refreshes the list', async () => {
    mockApi.getUploads
      .mockResolvedValueOnce({
        success: true,
        data: { csvs: [], images: [{ id: 'a.jpg', name: 'a.jpg' }] }
      })
      .mockResolvedValueOnce({ success: true, data: { csvs: [], images: [] } });
    renderWithI18n(<DashboardPage />, 'en');

    await waitFor(() => expect(screen.getByText('a.jpg')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete a.jpg' }));

    expect(mockApi.deleteImageUpload).toHaveBeenCalledWith('a.jpg');
    await waitFor(() => expect(screen.queryByText('a.jpg')).not.toBeInTheDocument());
  });

  it('deletes all CSV and image files and refreshes the list', async () => {
    mockApi.getUploads
      .mockResolvedValueOnce({
        success: true,
        data: {
          csvs: [{ id: 'file-1', name: 'products.csv' }],
          images: [{ id: 'a.jpg', name: 'a.jpg' }]
        }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          csvs: [],
          images: [{ id: 'a.jpg', name: 'a.jpg' }]
        }
      })
      .mockResolvedValueOnce({ success: true, data: { csvs: [], images: [] } });
    renderWithI18n(<DashboardPage />, 'en');

    await waitFor(() => expect(screen.getByText('products.csv')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Delete all' })[0]);
    expect(mockApi.deleteAllCsvs).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Delete all' })).toHaveLength(1));
    await user.click(screen.getAllByRole('button', { name: 'Delete all' })[0]);

    expect(mockApi.deleteAllImages).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('products.csv')).not.toBeInTheDocument());
  });

  it('enables the images tab only after an image is uploaded', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });
    mockApi.uploadImages.mockResolvedValue({ success: true });
    renderWithI18n(<DashboardPage />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), new File(['a,b'], 'p.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validation' })).toBeEnabled());

    expect(screen.getByRole('button', { name: 'Images' })).toBeDisabled();

    await user.upload(screen.getByLabelText(/Product images/), [new File(['x'], 'img.jpg', { type: 'image/jpeg' })]);
    await user.click(screen.getByRole('button', { name: 'Upload images' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Images' })).toBeEnabled());
  });

  it('re-locks the data tabs after all CSV files are deleted', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });
    mockApi.getUploads
      .mockResolvedValueOnce({ success: true, data: { csvs: [], images: [] } })
      .mockResolvedValueOnce({ success: true, data: { csvs: [], images: [] } });
    renderWithI18n(<DashboardPage />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), new File(['a,b'], 'p.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Validation' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Delete all' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Validation' })).toBeDisabled());
  });
});
