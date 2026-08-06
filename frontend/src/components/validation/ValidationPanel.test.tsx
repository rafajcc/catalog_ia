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
    validation_errors: []
  },
  {
    id: 'p2',
    name: 'Beta',
    validation_errors: [{ field: 'name', message: 'missing', code: 'REQUIRED', severity: 'error' }]
  }
];

describe('ValidationPanel', () => {
  beforeEach(() => {
    mockApi = {
      validateProducts: jest.fn(),
      getValidationResults: jest.fn()
    };
  });

  it('validates products and renders the summary table', async () => {
    mockApi.validateProducts.mockResolvedValue({ success: true, data: { products } });
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validate products' }));

    await waitFor(() => expect(mockApi.validateProducts).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText('2 total')).toBeInTheDocument();
    expect(screen.getByText('1 valid')).toBeInTheDocument();
    expect(screen.getByText('1 with errors')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText(/Validation finished \(2 products\)/)).toBeInTheDocument();
  });

  it('auto-loads the stored validation results when autoLoad is enabled', async () => {
    mockApi.getValidationResults.mockResolvedValue({ success: true, data: { products } });
    renderWithI18n(<ValidationPanel dataId="d1" autoLoad />, 'en');

    await waitFor(() => expect(mockApi.getValidationResults).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText('2 total')).toBeInTheDocument();
    expect(screen.getByText('1 valid')).toBeInTheDocument();
    expect(screen.getByText('1 with errors')).toBeInTheDocument();
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

  it('lists the CSV files being validated', () => {
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

    expect(screen.getByText('Loaded files: products.csv, catalog.csv')).toBeInTheDocument();
  });

  it('does not render the file list when there are no files', () => {
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    expect(screen.queryByText(/Loaded files:/)).not.toBeInTheDocument();
  });

  it('invokes onValidated after validation succeeds', async () => {
    mockApi.validateProducts.mockResolvedValue({ success: true, data: { products } });
    const onValidated = jest.fn();
    renderWithI18n(<ValidationPanel dataId="d1" onValidated={onValidated} />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validate products' }));

    await waitFor(() => expect(onValidated).toHaveBeenCalledTimes(1));
  });
});

