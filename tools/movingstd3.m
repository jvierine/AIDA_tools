function s = movingstd3(A,k)
% movingstd3: efficient windowed standard deviation of a 3-d array
% usage: s = movingstd(x,windowsize)
%
% Central windows around every element of the array will be employed,
% so a windowsize of 1 will generate a sliding window of size
% (2*k(idx)+1)*(2*k(idx)+1) around every element in the array. Thus, when k=1,
% the sliding window will be a 3x3x3 window. For k=2, this will result in
% a 5x5x5 sliding window.
%
% Only central windows are allowed in movingstd2, as opposed to movingstd
% which allowed several window types.
%
% Movingstd2 uses conv2 to compute the standard deviation, using
% the trick of std = sqrt((sum(x.^2) - n*xbar.^2)/(n-1)).
% Beware that this formula can suffer from numerical problems for
% data which is large in magnitude. Your data is automatically
% centered and scaled to alleviate these problems as much as possible.
%
% Along the edges of the array, the window is truncated to fit as
% necessary.
%
% arguments: (input)
%  A   - 3-D Array containing the data. Must be numeric, although A will
%        be internally converted to double if it is not double already.
%
%        A should NOT have any INF or NaN elements in it, as that will
%        corrupt the computation.
%
%  k   - size of the sliding window to use
%        Window width is adjusted near the edges as necessary.
%
%        Where k is so large that the window size is actually larger than
%        the array, the window is truncated as necessary.
%
%        k must be an integer or a [1 x 3] integer array
%
%        default: k=2, so a 5x5x5 window
%
% arguments: (output)
%  s   - array containing the windowed standard deviation.
%        size(A) will be the same as size(s)
%
% Example:
% rng(1)
% movingstd3(randn([4,5,6]),[1,2,3])
% ans(:,:,1) =
%       0.88511      0.92007       1.0083       1.0319       1.1168
%       0.90667      0.93273      0.98611      0.99458       1.0707
%       0.95464      0.93196      0.97623      0.94952      0.98589
%       0.88864      0.89865      0.89425      0.86622      0.85712
% ans(:,:,2) =
%       0.84445      0.90552        1.001       1.0426       1.1119
%       0.9113      0.94155      0.98523      0.98592       1.0454
%       0.97774      0.97126       1.0163       1.0047       1.0446
%       0.92041      0.90721      0.91174      0.88538       0.9086
% ans(:,:,3) =
%       0.85793      0.90232      0.97827       1.0179       1.0681
%       0.95125      0.96503      0.99394      0.97778       1.0194
%       0.98749      0.97944       1.0038      0.97593       1.0001
%       0.89456      0.91395      0.90275       0.8619      0.89063
% ans(:,:,4) =
%       0.85793      0.90232      0.97827       1.0179       1.0681
%       0.95125      0.96503      0.99394      0.97778       1.0194
%       0.98749      0.97944       1.0038      0.97593       1.0001
%       0.89456      0.91395      0.90275       0.8619      0.89063
% ans(:,:,5) =
%       0.86549      0.89892      0.97407       1.0269       1.0561
%       0.99772       1.0015       1.0039      0.98566       1.0104
%         1.022       1.0225       1.0153      0.98648      0.99777
%       0.86773      0.93457      0.88824      0.85248      0.86456
% ans(:,:,6) =
%       0.86981      0.92111       0.9675       1.0154       1.0715
%       0.95837      0.98777      0.98276      0.96778       1.0029
%       0.99195        1.004       1.0035      0.99701       1.0221
%       0.82019      0.90455      0.86889       0.8661      0.89255

% Author: Bjorn Gustavsson
% e-mail: bjorn.gustavsson@uit.no
%   date: 20160925

% Modified from movingstd2 by John D'Errico
% e-mail: woodchips@rochester.rr.com
%   date: 4/8/2016

% check for k default
if (nargin<2) || isempty(k)
  % supply the default:
  k = 1;
else
  sz_k = size(k(:)');
  if ~isnumeric(k) || ~( isscalar(k) || all(sz_k==[1,3]))|| any(k < 1) || ~all(k==round(k))
    error('If supplied, k must be positive integer, scalar or a 1x3-array')
  end
end

% size of the array
n = size(A);
if numel(n) ~= 3
  error('A must be a 3-dimensional array')
end

% ensure the array is a double precision one.
if ~isa(A,'double')
  A = double(A);
end

% Improve the numerical analysis by subtracting off the array mean
% this has no effect on the standard deviation, but when the mean
% islarge, the formula used will incur numerical issues.
A = A - mean(A(:));

% scale the array to have unit variance too. will put that
% scale factor back into the result at the end
Astd = std(A(:));
A = A./Astd;

% we will need the squared elements 
A2 = A.^2;

% we also need an array of ones of the same size as A. This will let us
% count the number of elements in each truncated window near the edges.
wuns = ones(size(A));

if numel(k) == 1
  k = k([1,1,1]);
end
% convolution kernel
kernel = ones(2*k(1)+1,2*k(2)+1,2*k(3)+1);

% compute the std using:
%     std = sqrt((sum(x.^2) - (sum(x)).^2/n)/(n-1))
N = convn(wuns,kernel,'same');
s = sqrt((convn(A2,kernel,'same') - ((convn(A,kernel,'same')).^2)./N)./(N-1));

% catch any complex cases that may have fallen through the cracks.
% that must be due to a floating point error, so in those cases, the std
% would be so small as to be zero.
s(imag(s) ~= 0) = 0;

% restore the scale factor that was used before to normalize the data
s = s.*Astd;
