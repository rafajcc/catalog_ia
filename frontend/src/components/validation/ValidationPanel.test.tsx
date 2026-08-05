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

  it('loads existing results', async () => {
    mockApi.getValidationResults.mockResolvedValue({ success: true, data: { products } });
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load results' }));

    await waitFor(() => expect(mockApi.getValidationResults).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText(/Results loaded \(2 products\)/)).toBeInTheDocument();
  });

  it('shows an error when validation fails', async () => {
    mockApi.validateProducts.mockRejectedValue(new Error('validation crashed'));
    renderWithI18n(<ValidationPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Validate products' }));

    expect(await screen.findByText('validation crashed')).toBeInTheDocument();
  });
});

