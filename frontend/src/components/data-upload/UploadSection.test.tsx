import { screen, waitFor } from '@testing-library/react';
import { renderWithI18n } from '../../test-utils';
import userEvent from '@testing-library/user-event';
import UploadSection from './UploadSection';

var mockApi: any;

jest.mock('../../services/api-service', () => ({
  getApiService: () => mockApi
}));

function makeFile(name: string) {
  return new File(['a,b\n1,2'], name, { type: 'text/csv' });
}

describe('UploadSection', () => {
  beforeEach(() => {
    mockApi = {
      uploadCSV: jest.fn(),
      parseCSV: jest.fn(),
      uploadImages: jest.fn(),
      selectImageFolder: jest.fn()
    };
  });

  it('uploads and processes a CSV, notifying with the data id', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });
    const onDataReady = jest.fn();

    renderWithI18n(<UploadSection onDataReady={onDataReady} />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), makeFile('products.csv'));
    await user.click(screen.getByRole('button', { name: /Upload and process CSV/ }));

    await waitFor(() => expect(onDataReady).toHaveBeenCalledWith('data-1'));
    expect(mockApi.uploadCSV).toHaveBeenCalledWith(expect.any(File));
    expect(mockApi.parseCSV).toHaveBeenCalledWith('file-1');
    expect(screen.getByText(/File processed. Data id: data-1/)).toBeInTheDocument();
  });

  it('shows an error when the CSV upload fails', async () => {
    mockApi.uploadCSV.mockRejectedValue(new Error('upload failed'));
    const onDataReady = jest.fn();

    renderWithI18n(<UploadSection onDataReady={onDataReady} />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), makeFile('products.csv'));
    await user.click(screen.getByRole('button', { name: /Upload and process CSV/ }));

    expect(await screen.findByText('upload failed')).toBeInTheDocument();
    expect(onDataReady).not.toHaveBeenCalled();
  });

  it('warns when no CSV is selected', async () => {
    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Upload and process CSV/ }));

    expect(screen.getByText('Select a CSV file first')).toBeInTheDocument();
    expect(mockApi.uploadCSV).not.toHaveBeenCalled();
  });

  it('uploads multiple images', async () => {
    mockApi.uploadImages.mockResolvedValue({ success: true });
    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product images/), [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' })
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload images' }));

    expect(mockApi.uploadImages).toHaveBeenCalledTimes(1);
    expect((mockApi.uploadImages.mock.calls[0][0] as File[]).length).toBe(2);
    expect(await screen.findByText('2 image(s) uploaded')).toBeInTheDocument();
  });

  it('selects an image folder', async () => {
    mockApi.selectImageFolder.mockResolvedValue({ success: true });
    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Image folder path/), 'C:/images');
    await user.click(screen.getByRole('button', { name: 'Select folder' }));

    expect(mockApi.selectImageFolder).toHaveBeenCalledWith('C:/images');
    expect(await screen.findByText('Image folder selected')).toBeInTheDocument();
  });

  it('shows the current data id chip when provided', () => {
    renderWithI18n(<UploadSection dataId="data-9" />, 'en');
    expect(screen.getByText(/Data id: data-9/)).toBeInTheDocument();
  });
});

