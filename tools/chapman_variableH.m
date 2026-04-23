function [chpm_int] = chapman_variableH(I0,hmax,H,h)
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
if isa(H,'function_handle')
  Hz = H(h);
elseif numel(H) == 2
  Hz = interp1(h([1 end]),H,h);
elseif numel(H) == 1
  Hz = H;
end
  
hi = cumtrapz(ones(size(h))./Hz) - trapz(ones(size(h(h<hmax)))./Hz(h<hmax));

% chpm_int = 1*I0*exp(1-abs(hi).^gamma(1).*sign(hi)-exp(-abs(hi).^gamma(2).*sign(hi)));
chpm_int = 1*I0*exp(1-hi-exp(-hi));
  
end
% keyboard
