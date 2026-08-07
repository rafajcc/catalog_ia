import { screen, waitFor } from '@testing-library/react';
import { renderWithI18n } from '../../test-utils';
import userEvent from '@testing-library/user-event';
import ValidationPanel from './ValidationPanel';

var mockApi: any;

jest.mock('../../services/api-service', () => ({
  getApiService: () => mockApi
}));

const products = [
  {
    id: 'p1',
    name: 'Alpha',
    ean: '8412345678901',
    reference: 'REF-ALPHA',
    validation_errors: []
  },
  {
    id: 'p2',
    name: 'Beta',
    ean: '8412345678902',
    reference: 'REF-BETA',
    validation_errors: [{ field: 'name', message: 'missing', code: 'REQUIRED', severity: 'error' }]
  }
];

const checkedConsistency = {
  resolutions: [
    { row_id: 'p1', row: products[0], id_product: '11', combination: { id_product_attribute: '101', id_product: '11' } },
    { row_id: 'p2', row: products[1], id_product: '11', combination: { id_product_attribute: '102', id_product: '11' } }
  ],
  issues: [],
  not_found_count: 0,
  checked: true
};

describe('ValidationPanel', () => {
  beforeEach(() => {
    mockApi = {
      validateProducts: jest.fn(),
      getValidationResults: jest.fn(),
      uploadValidatedRows: jest.fn()
    };
  });

  it('validates products and renders the editable table with summary chips', async () => {
    mockApi.validateProducts.mockResolvedValue({ success: true, data: { products, consistency: checkedConsistency } });
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validate products' }));

    await waitFor(() => expect(mockApi.validateProducts).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText('2 total')).toBeInTheDocument();
    expect(screen.getByText('1 valid')).toBeInTheDocument();
    expect(screen.getByText('1 with errors')).toBeInTheDocument();
    expect(screen.getByText('0 inconsistencies')).toBeInTheDocument();
    expect(screen.getByText('0 EANs not found')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alpha')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Beta')).toBeInTheDocument();
    expect(screen.getByText('8412345678901')).toBeInTheDocument();
    expect(screen.getByDisplayValue('REF-ALPHA')).toBeInTheDocument();
    expect(screen.getByText('EAN')).toBeInTheDocument();
    expect(screen.getByText('Reference')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload changes' })).toBeEnabled();
    expect(screen.getByText(/Validation finished \(2 products\)/)).toBeInTheDocument();
  });

  it('auto-loads the stored validation results including consistency when autoLoad is enabled', async () => {
    mockApi.getValidationResults.mockResolvedValue({
      success: true,
      data: { products, consistency: checkedConsistency }
    });
    renderWithI18n(<ValidationPanel dataId="d1" autoLoad />, 'en');

    await waitFor(() => expect(mockApi.getValidationResults).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText('2 total')).toBeInTheDocument();
    expect(screen.getByText('1 valid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload changes' })).toBeEnabled();
    expect(screen.getByText(/Results loaded \(2 products\)/)).toBeInTheDocument();
  });

  it('does not auto-load results when autoLoad is disabled', async () => {
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Validate products' })).toBeEnabled());
    expect(mockApi.getValidationResults).not.toHaveBeenCalled();
  });

  it('shows the error when auto-loading fails', async () => {
    mockApi.getValidationResults.mockRejectedValue(new Error('results crashed'));
    renderWithI18n(<ValidationPanel dataId="d1" autoLoad />, 'en');

    expect(await screen.findByText('results crashed')).toBeInTheDocument();
    expect(mockApi.validateProducts).not.toHaveBeenCalled();
  });

  it('shows an error when validation fails', async () => {
    mockApi.validateProducts.mockRejectedValue(new Error('validation crashed'));
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validate products' }));

    expect(await screen.findByText('validation crashed')).toBeInTheDocument();
  });

  it('edits cells and uploads the edited rows to PrestaShop', async () => {
    mockApi.validateProducts.mockResolvedValue({ success: true, data: { products, consistency: checkedConsistency } });
    mockApi.uploadValidatedRows.mockResolvedValue({
      success: true,
      data: {
        products_updated: 1,
        combinations_updated: 2,
        stock_updated: 1,
        manufacturers_created: 0,
        categories_created: 0,
        results: [{ row_id: 'p1', operation: 'update_product', status: 'completed' }]
      }
    });
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validate products' }));
    await screen.findByText('2 total');

    await user.clear(screen.getByLabelText('8412345678901 Name'));
    await user.type(screen.getByLabelText('8412345678901 Name'), 'Alpha v2');
    await user.clear(screen.getByLabelText('8412345678901 Price'));
    await user.type(screen.getByLabelText('8412345678901 Price'), '12.5');
    await user.click(screen.getByRole('button', { name: 'Upload changes' }));

    await waitFor(() => expect(mockApi.uploadValidatedRows).toHaveBeenCalledWith('d1', expect.any(Array)));
    const rows = mockApi.uploadValidatedRows.mock.calls[0][1];
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Alpha v2');
    expect(rows[0].price).toBe(12.5);
    expect(rows[1]).toEqual(products[1]);
    expect(await screen.findByText('Changes uploaded to PrestaShop')).toBeInTheDocument();
    expect(screen.getByText('1 products updated')).toBeInTheDocument();
    expect(screen.getByText('2 combinations updated')).toBeInTheDocument();
    expect(screen.getByText('1 stock updated')).toBeInTheDocument();
    expect(screen.getByText('0 operations failed')).toBeInTheDocument();
  });

  it('keeps upload disabled when consistency has not been checked', async () => {
    mockApi.validateProducts.mockResolvedValue({
      success: true,
      data: { products, consistency: { ...checkedConsistency, checked: false } }
    });
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validate products' }));
    await screen.findByText('2 total');

    expect(screen.getByText(/consistency check skipped/i)).toBeInTheDocument();
    const upload = screen.getByRole('button', { name: 'Upload changes' });
    expect(upload).toBeDisabled();

    await user.click(upload);
    expect(mockApi.uploadValidatedRows).not.toHaveBeenCalled();
  });

  it('flags inconsistent product-level cells and clears the flag when they are fixed', async () => {
    const rows = [
      { id: 'r1', name: 'Alpha', ean: '111', reference: 'R1', validation_errors: [] },
      { id: 'r2', name: 'Beta', ean: '222', reference: 'R2', validation_errors: [] }
    ];
    const consistency = {
      resolutions: [
        { row_id: 'r1', row: rows[0], id_product: '11', combination: { id_product_attribute: '101', id_product: '11' } },
        { row_id: 'r2', row: rows[1], id_product: '11', combination: { id_product_attribute: '102', id_product: '11' } }
      ],
      issues: [],
      not_found_count: 0,
      checked: true
    };
    mockApi.validateProducts.mockResolvedValue({ success: true, data: { products: rows, consistency } });
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validate products' }));
    await screen.findByText('2 total');

    expect(
      screen.getAllByTitle('Value inconsistent with other variants of the same product.')
    ).toHaveLength(2);

    await user.clear(screen.getByLabelText('222 Name'));
    await user.type(screen.getByLabelText('222 Name'), 'Alpha');

    await waitFor(() =>
      expect(
        screen.queryAllByTitle('Value inconsistent with other variants of the same product.')
      ).toHaveLength(0)
    );
  });

  it('shows an error when the upload fails', async () => {
    mockApi.validateProducts.mockResolvedValue({ success: true, data: { products, consistency: checkedConsistency } });
    mockApi.uploadValidatedRows.mockRejectedValue(new Error('upload crashed'));
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validate products' }));
    await screen.findByText('2 total');

    await user.click(screen.getByRole('button', { name: 'Upload changes' }));
    expect(await screen.findByText('upload crashed')).toBeInTheDocument();
  });

  it('lists the CSV files being validated in a collapsible list', async () => {
    renderWithI18n(
      <ValidationPanel
        dataId="d1"
        csvFiles={[
          { id: 'file-1', name: 'products.csv' },
          { id: 'file-2', name: 'catalog.csv' }
        ]}
      />,
      'en'
    );

    expect(screen.getByText('Loaded files (2)')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Show files' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('products.csv')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('products.csv')).toBeInTheDocument();
    expect(screen.getByText('catalog.csv')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide files' }));
    expect(screen.queryByText('products.csv')).not.toBeInTheDocument();
  });

  it('does not render the file list when there are no files', () => {
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    expect(screen.queryByText(/Loaded files/)).not.toBeInTheDocument();
  });

  it('invokes onValidated after validation succeeds', async () => {
    mockApi.validateProducts.mockResolvedValue({ success: true, data: { products, consistency: checkedConsistency } });
    const onValidated = jest.fn();
    renderWithI18n(<ValidationPanel dataId="d1" onValidated={onValidated} />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validate products' }));

    await waitFor(() => expect(onValidated).toHaveBeenCalledTimes(1));
  });
});
