import { downloadBlob, getErrorMessage } from './download';

describe('downloadBlob', () => {
  let createSpy: jest.SpyInstance;
  let revokeSpy: jest.SpyInstance;
  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    clickSpy = jest.fn();
    createSpy = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    revokeSpy = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    jest.spyOn(document, 'createElement').mockReturnValue({ click: clickSpy } as unknown as HTMLAnchorElement);
    jest.spyOn(document.body, 'appendChild').mockImplementation(() => undefined as never);
    jest.spyOn(document.body, 'removeChild').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('triggers a download with the given filename', () => {
    const blob = new Blob(['data']);
    downloadBlob(blob, 'report.csv');

    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake');
  });
});

describe('getErrorMessage', () => {
  it('returns the error message for Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns non-empty string errors', () => {
    expect(getErrorMessage('custom failure')).toBe('custom failure');
  });

  it('falls back to a generic message', () => {
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
    expect(getErrorMessage({})).toBe('An unexpected error occurred');
    expect(getErrorMessage('')).toBe('An unexpected error occurred');
  });
});
