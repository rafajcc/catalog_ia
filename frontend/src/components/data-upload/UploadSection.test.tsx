import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { renderWithI18n } from '../../test-utils';
import userEvent from '@testing-library/user-event';
import UploadSection from './UploadSection';
import { UploadItem } from '../../types';

var mockApi: any;

jest.mock('../../services/api-service', () => ({
  getApiService: () => mockApi
}));

function makeFile(name: string) {
  return new File(['a,b\n1,2'], name, { type: 'text/csv' });
}

function UploadHarness() {
  const [csvs, setCsvs] = useState<UploadItem[]>([]);
  const [images, setImages] = useState<UploadItem[]>([]);
  return (
    <UploadSection
      uploadedCsvs={csvs}
      uploadedImages={images}
      onCsvUploaded={(item) => setCsvs((prev) => [...prev, item])}
      onImagesUploaded={(items) => setImages((prev) => [...prev, ...items])}
    />
  );
}

describe('UploadSection', () => {
  beforeEach(() => {
    mockApi = {
      uploadCSV: jest.fn(),
      parseCSV: jest.fn(),
      uploadImages: jest.fn(),
      selectImageFolder: jest.fn(),
      getCsvTemplate: jest.fn(),
      deleteCsvUpload: jest.fn(),
      deleteImageUpload: jest.fn(),
      deleteAllCsvs: jest.fn(),
      deleteAllImages: jest.fn(),
      fetchPrestashopData: jest.fn(),
      clearPrestashopData: jest.fn()
    };
  });

  it('uploads and processes a CSV, notifying with the data id', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });
    const onDataReady = jest.fn();
    const onCsvUploaded = jest.fn();

    renderWithI18n(<UploadSection onDataReady={onDataReady} onCsvUploaded={onCsvUploaded} />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), makeFile('products.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));

    await waitFor(() => expect(onDataReady).toHaveBeenCalledWith('data-1'));
    expect(onCsvUploaded).toHaveBeenCalledWith({ id: 'file-1', name: 'products.csv' });
    expect(mockApi.uploadCSV).toHaveBeenCalledWith(expect.any(File));
    expect(mockApi.parseCSV).toHaveBeenCalledWith('file-1');
    expect(screen.getByText('CSV file uploaded: products.csv')).toBeInTheDocument();
  });

  it('shows an error when the CSV upload fails', async () => {
    mockApi.uploadCSV.mockRejectedValue(new Error('upload failed'));
    const onDataReady = jest.fn();

    renderWithI18n(<UploadSection onDataReady={onDataReady} />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), makeFile('products.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));

    expect(await screen.findByText('upload failed')).toBeInTheDocument();
    expect(onDataReady).not.toHaveBeenCalled();
  });

  it('shows the CSV format error in Spanish', async () => {
    mockApi.uploadCSV.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: {
            message:
              'The file "preview_20260123_182113.csv" has 7 column(s) but 12 are expected. Download the template to see the expected format.',
            statusCode: 400,
            code: 'CSV_COLUMN_COUNT_MISMATCH',
            details: { name: 'preview_20260123_182113.csv', columns: 7, expected: 12 }
          }
        }
      }
    });

    renderWithI18n(<UploadSection />, 'es');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Catálogo de productos \(CSV\)/), makeFile('preview_20260123_182113.csv'));
    await user.click(screen.getByRole('button', { name: /Subir CSV/ }));

    expect(
      await screen.findByText(
        'El archivo "preview_20260123_182113.csv" tiene 7 columna(s) pero se esperan 12. Descarga la plantilla para ver el formato esperado.'
      )
    ).toBeInTheDocument();
  });

  it('shows the missing-columns CSV error in Spanish', async () => {
    mockApi.uploadCSV.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: {
            message: 'The file "mal.csv" does not follow the expected format. Missing columns: ean, name.',
            statusCode: 400,
            code: 'CSV_MISSING_COLUMNS',
            details: { name: 'mal.csv', missing: ['ean', 'name'] }
          }
        }
      }
    });

    renderWithI18n(<UploadSection />, 'es');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Catálogo de productos \(CSV\)/), makeFile('mal.csv'));
    await user.click(screen.getByRole('button', { name: /Subir CSV/ }));

    expect(
      await screen.findByText('El archivo "mal.csv" no sigue el formato esperado. Faltan las columnas: ean, name.')
    ).toBeInTheDocument();
  });

  it('warns when no CSV is selected', async () => {
    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));

    expect(screen.getByText('Select a CSV file first')).toBeInTheDocument();
    expect(mockApi.uploadCSV).not.toHaveBeenCalled();
  });

  it('rejects files that are not CSV before uploading', async () => {
    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText(/Product catalog \(CSV\)/), {
      target: { files: [makeFile('datos.txt')] }
    });
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));

    expect(screen.getByText(/"datos.txt" is not a CSV file \(extension must be \.csv\)/)).toBeInTheDocument();
    expect(mockApi.uploadCSV).not.toHaveBeenCalled();
    expect(mockApi.parseCSV).not.toHaveBeenCalled();
  });

  it('uploads multiple images', async () => {
    mockApi.uploadImages.mockResolvedValue({ success: true });
    const onImagesUploaded = jest.fn();
    renderWithI18n(<UploadSection onImagesUploaded={onImagesUploaded} />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product images/), [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' })
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload images' }));

    expect(mockApi.uploadImages).toHaveBeenCalledTimes(1);
    expect((mockApi.uploadImages.mock.calls[0][0] as File[]).length).toBe(2);
    expect(onImagesUploaded).toHaveBeenCalledWith([
      { id: 'a.jpg', name: 'a.jpg' },
      { id: 'b.jpg', name: 'b.jpg' }
    ]);
    expect(await screen.findByText('2 image(s) uploaded')).toBeInTheDocument();
  });

  it('rejects images that are not JPG or JPEG before uploading', async () => {
    renderWithI18n(<UploadSection />, 'en');

    fireEvent.change(screen.getByLabelText(/Product images/), {
      target: {
        files: [
          new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
          new File(['b'], 'b.png', { type: 'image/png' })
        ]
      }
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Upload images' }));

    expect(screen.getByText(/Only JPG\/JPEG images are allowed \("b.png"\)/)).toBeInTheDocument();
    expect(mockApi.uploadImages).not.toHaveBeenCalled();
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

  it('downloads the CSV template from the backend', async () => {
    mockApi.getCsvTemplate.mockResolvedValue(new Blob(['ean,name'], { type: 'text/csv' }));
    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Download template' }));

    expect(mockApi.getCsvTemplate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Template downloaded')).toBeInTheDocument();
  });

  it('toggles the CSV format guide with the help button', async () => {
    renderWithI18n(<UploadSection />, 'es');

    const user = userEvent.setup();
    expect(screen.queryByText(/El CSV debe incluir esta cabecera exacta/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver guía de formato del CSV' }));

    expect(screen.getByText(/El CSV debe incluir esta cabecera exacta/)).toBeInTheDocument();
    expect(screen.getByText('ean')).toBeInTheDocument();
    expect(screen.getByText('reference')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getAllByText('Sí')).toHaveLength(3);
    expect(screen.queryByText('stock')).not.toBeInTheDocument();
    expect(screen.queryByText('weight')).not.toBeInTheDocument();
    expect(screen.queryByText('sku')).not.toBeInTheDocument();
    expect(screen.getByText(/8412345678901,REF-001/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver guía de formato del CSV' }));

    expect(screen.queryByText(/El CSV debe incluir esta cabecera exacta/)).not.toBeInTheDocument();
  });

  it('shows an error when the template download fails', async () => {
    mockApi.getCsvTemplate.mockRejectedValue(new Error('template unavailable'));
    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Download template' }));

    expect(await screen.findByText('template unavailable')).toBeInTheDocument();
  });

  it('keeps a counter and a list of every uploaded CSV and image', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });
    mockApi.uploadImages.mockResolvedValue({ success: true });

    renderWithI18n(<UploadHarness />, 'en');

    const user = userEvent.setup();

    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), makeFile('catalog-a.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));
    await waitFor(() => expect(screen.getByText('(1 uploaded)')).toBeInTheDocument());

    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), makeFile('catalog-b.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));
    await waitFor(() => expect(screen.getByText('(2 uploaded)')).toBeInTheDocument());

    await user.upload(screen.getByLabelText(/Product images/), [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' })
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload images' }));
    await waitFor(() => expect(screen.getAllByText('(2 uploaded)')).toHaveLength(2));

    expect(screen.getByText('Uploaded files')).toBeInTheDocument();
    expect(screen.getByText('catalog-a.csv')).toBeInTheDocument();
    expect(screen.getByText('catalog-b.csv')).toBeInTheDocument();
    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
  });

  it('rejects a CSV file that has already been uploaded', async () => {
    mockApi.uploadCSV.mockResolvedValue({ success: true, file_id: 'file-1' });
    mockApi.parseCSV.mockResolvedValue({ success: true, data: { data_id: 'data-1' } });

    renderWithI18n(<UploadHarness />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), makeFile('products.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));
    await waitFor(() => expect(screen.getByText('(1 uploaded)')).toBeInTheDocument());

    await user.upload(screen.getByLabelText(/Product catalog \(CSV\)/), makeFile('products.csv'));
    await user.click(screen.getByRole('button', { name: /Upload CSV/ }));

    expect(screen.getByText(/"products.csv" has already been uploaded/)).toBeInTheDocument();
    expect(mockApi.uploadCSV).toHaveBeenCalledTimes(1);
    expect(mockApi.parseCSV).toHaveBeenCalledTimes(1);
  });

  it('rejects an image that has already been uploaded', async () => {
    mockApi.uploadImages.mockResolvedValue({ success: true });
    renderWithI18n(<UploadHarness />, 'en');

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/Product images/), [new File(['a'], 'a.jpg', { type: 'image/jpeg' })]);
    await user.click(screen.getByRole('button', { name: 'Upload images' }));
    await waitFor(() => expect(screen.getByText('(1 uploaded)')).toBeInTheDocument());

    await user.upload(screen.getByLabelText(/Product images/), [new File(['a'], 'a.jpg', { type: 'image/jpeg' })]);
    await user.click(screen.getByRole('button', { name: 'Upload images' }));

    expect(screen.getByText(/"a.jpg" has already been uploaded/)).toBeInTheDocument();
    expect(mockApi.uploadImages).toHaveBeenCalledTimes(1);
  });

  it('deletes a single file, reports it and notifies the parent', async () => {
    mockApi.deleteCsvUpload.mockResolvedValue({ success: true });
    mockApi.deleteImageUpload.mockResolvedValue({ success: true });
    const onUploadsChanged = jest.fn();

    renderWithI18n(
      <UploadSection
        uploadedCsvs={[{ id: 'file-1', name: 'catalog.csv' }]}
        uploadedImages={[{ id: 'img.jpg', name: 'img.jpg' }]}
        onUploadsChanged={onUploadsChanged}
      />,
      'en'
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete catalog.csv' }));
    expect(mockApi.deleteCsvUpload).toHaveBeenCalledWith('file-1');
    expect(await screen.findByText('CSV "catalog.csv" deleted')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete img.jpg' }));
    expect(mockApi.deleteImageUpload).toHaveBeenCalledWith('img.jpg');
    expect(await screen.findByText('Image "img.jpg" deleted')).toBeInTheDocument();

    expect(onUploadsChanged).toHaveBeenCalledTimes(2);
  });

  it('reports an error when a delete fails', async () => {
    mockApi.deleteCsvUpload.mockRejectedValue(new Error('delete failed'));

    renderWithI18n(<UploadSection uploadedCsvs={[{ id: 'file-1', name: 'catalog.csv' }]} />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete catalog.csv' }));

    expect(await screen.findByText('delete failed')).toBeInTheDocument();
    expect(mockApi.deleteCsvUpload).toHaveBeenCalledWith('file-1');
  });

  it('deletes all files of each group and reports it', async () => {
    mockApi.deleteAllCsvs.mockResolvedValue({ success: true });
    mockApi.deleteAllImages.mockResolvedValue({ success: true });

    renderWithI18n(
      <UploadSection
        uploadedCsvs={[{ id: 'file-1', name: 'catalog.csv' }]}
        uploadedImages={[{ id: 'img.jpg', name: 'img.jpg' }]}
      />,
      'en'
    );

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Delete all' })[0]);
    expect(mockApi.deleteAllCsvs).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('All CSV files deleted')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Delete all' })[1]);
    expect(mockApi.deleteAllImages).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('All images deleted')).toBeInTheDocument();
  });

  it('fetches products from PrestaShop by EAN and notifies the parent', async () => {
    mockApi.fetchPrestashopData.mockResolvedValue({
      success: true,
      data: { data_id: 'ps-1', summary: { total: 2 } }
    });
    const onPrestashopReady = jest.fn();

    renderWithI18n(<UploadSection onPrestashopReady={onPrestashopReady} />, 'en');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/EAN codes/), '8412345678901\n8423456789012');
    await user.click(screen.getByRole('button', { name: 'Fetch from PrestaShop' }));

    await waitFor(() => expect(onPrestashopReady).toHaveBeenCalledWith('ps-1', 2));
    expect(mockApi.fetchPrestashopData).toHaveBeenCalledWith({
      eans: ['8412345678901', '8423456789012'],
      references: [],
      description: 'all',
      images: 'all',
      limit: 50
    });
    expect(await screen.findByText('Imported 2 products from PrestaShop')).toBeInTheDocument();
  });

  it('sends references and the selected filters to the fetch endpoint', async () => {
    mockApi.fetchPrestashopData.mockResolvedValue({ success: true, data: { data_id: 'ps-1', summary: { total: 1 } } });

    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/References/), 'REF-001, REF-002');
    await user.selectOptions(screen.getByLabelText('Description'), 'with');
    await user.selectOptions(screen.getByLabelText('Images'), 'without');
    await user.click(screen.getByRole('button', { name: 'Fetch from PrestaShop' }));

    await waitFor(() =>
      expect(mockApi.fetchPrestashopData).toHaveBeenCalledWith({
        eans: [],
        references: ['REF-001', 'REF-002'],
        description: 'with',
        images: 'without',
        limit: 50
      })
    );
  });

  it('shows the 50-product limit note', () => {
    renderWithI18n(<UploadSection />, 'es');
    expect(screen.getByText(/Se importarán como máximo los primeros 50 productos/)).toBeInTheDocument();
  });

  it('warns and confirms before fetching when CSVs are already uploaded', async () => {
    mockApi.fetchPrestashopData.mockResolvedValue({ success: true, data: { data_id: 'ps-1', summary: { total: 1 } } });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithI18n(<UploadSection uploadedCsvs={[{ id: 'file-1', name: 'catalog.csv' }]} />, 'en');

    expect(
      screen.getByText('Fetching from PrestaShop will discard the currently uploaded CSVs. Continue?')
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/EAN codes/), '8412345678901');
    await user.click(screen.getByRole('button', { name: 'Fetch from PrestaShop' }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockApi.fetchPrestashopData).toHaveBeenCalledTimes(1));
    confirmSpy.mockRestore();
  });

  it('aborts the fetch when the user cancels the conflict confirmation', async () => {
    mockApi.fetchPrestashopData.mockResolvedValue({ success: true, data: { data_id: 'ps-1', summary: { total: 1 } } });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithI18n(<UploadSection uploadedCsvs={[{ id: 'file-1', name: 'catalog.csv' }]} />, 'en');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/EAN codes/), '8412345678901');
    await user.click(screen.getByRole('button', { name: 'Fetch from PrestaShop' }));

    expect(mockApi.fetchPrestashopData).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('requires at least one EAN or reference before fetching', async () => {
    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Fetch from PrestaShop' }));

    expect(screen.getByText('Enter at least one EAN or one reference')).toBeInTheDocument();
    expect(mockApi.fetchPrestashopData).not.toHaveBeenCalled();
  });

  it('shows a friendly error when PrestaShop is not configured', async () => {
    mockApi.fetchPrestashopData.mockRejectedValue({
      response: { data: { error: { message: 'PrestaShop must be configured to fetch products' } } }
    });
    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/EAN codes/), '8412345678901');
    await user.click(screen.getByRole('button', { name: 'Fetch from PrestaShop' }));

    expect(
      await screen.findByText('Configure PrestaShop in the Configuration tab to import products.')
    ).toBeInTheDocument();
  });

  it('shows a friendly error when no products match', async () => {
    mockApi.fetchPrestashopData.mockRejectedValue({
      response: { data: { error: { message: 'No products matched the given criteria' } } }
    });
    renderWithI18n(<UploadSection />, 'en');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/EAN codes/), '8412345678901');
    await user.click(screen.getByRole('button', { name: 'Fetch from PrestaShop' }));

    expect(await screen.findByText('No products matched the given criteria.')).toBeInTheDocument();
  });

  it('shows the fetched products count and a remove button when PrestaShop data is present', async () => {
    mockApi.clearPrestashopData.mockResolvedValue({ success: true });
    const onPrestashopCleared = jest.fn();

    renderWithI18n(
      <UploadSection
        prestashop={{ present: true, dataId: 'ps-1', count: 3 }}
        onPrestashopCleared={onPrestashopCleared}
      />,
      'en'
    );

    expect(screen.getByText('3 products imported from PrestaShop')).toBeInTheDocument();
    expect(screen.getByText('Uploading a CSV will replace the data imported from PrestaShop.')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remove imported data' }));

    expect(mockApi.clearPrestashopData).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('PrestaShop data removed')).toBeInTheDocument();
    expect(onPrestashopCleared).toHaveBeenCalledTimes(1);
  });
});
