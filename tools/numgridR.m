function G = numgridR(R,n)
%NUMGRIDR Number the grid points in a two dimensional region.
%   G = NUMGRIDR(REGION,[nx,ny]) numbers the points on an Ny-by-Nx grid in
%   the subregion of -1<=x<=1 and -1<=y<=1 determined by REGION.
%   SPY(NUMGRID(REGION,N)) plots the points.
%   DELSQ(NUMGRID(REGION,N)) generates the 5-point discrete Laplacian.
%   The regions currently available are:
%      'S' - the entire square.
%
%   See also DELSQ, DELSQSHOW, DELSQDEMO.

%   Copyright 1984-2010 The MathWorks, Inc. 
%   $Revision: 1.1.6.3 $  $Date: 2010/08/23 23:12:38 $

if R == 'N'
   G = nested(n);
else
  [x,y] = meshgrid([-1, (-(n(2)-3):2:(n(2)-3))/(n(2)-1), 1],[-1, (-(n(1)-3):2:(n(1)-3))/(n(1)-1), 1]);
  y = flipud(y);
  if R == 'S'
    G = (x > -1) & (x < 1) & (y > -1) & (y < 1);
  else
    error(message('MATLAB:numgrid:InvalidRegionType'));
  end
  k = find(G);
  G = zeros(size(G));      % Convert from logical to double matrix
  G(k) = (1:length(k))';
end
