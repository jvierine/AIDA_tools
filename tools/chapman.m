function [chpm_int] = chapman(I0,hmax,w0,h,C,gamma)
% CHAPMAN - gives the Chapman profile.
% 
% Calling:
%   chpm_int = chapman(I0,hmax,w0,h)
% Input: 
%   I0 - Max intensity
%   H0 - altitude of max intensity
%   W0 - width
%   H  - Altitude array.

%       Bjorn Gustavsson
%	Copyright © 1997 by Bjorn Gustavsson
%   This is free software, licensed under GNU GPL version 2 or later

% $$$ if nargin < 5
% $$$   gamma = [0,0];
% $$$ else
% $$$   gamma = gamma.*[1,1];
% $$$   w0 = w0.*[1,1];
% $$$ end
if nargin < 6 || isempty(gamma)
  gamma = 1;
end
if numel(w0) == 1
  
  hi = (h-hmax)./w0;
  chpm_int = 1*I0*exp(1-hi-exp(-hi));
  
elseif numel(w0) == 2
  
  h_u = (h-hmax)./w0(2);
  if nargin > 4
    h_u = 1./(1./exp(C(1)).^gamma+1./h_u.^gamma).^(1/gamma);
  end
  h_d = (h-hmax)./w0(1);
  if nargin > 4 && numel(C) > 1
    h_d = 1./(1./exp(C(2)).^gamma+1./h_d.^gamma).^(1/gamma);
  end
  
  hi = h_d;
  hi(h>hmax) = h_u(h>hmax);
  
  % chpm_int = 1*I0*exp(1-abs(hi).^gamma(1).*sign(hi)-exp(-abs(hi).^gamma(2).*sign(hi)));
  chpm_int = 1*I0*exp(1-hi-exp(-hi));
  
end
% keyboard
