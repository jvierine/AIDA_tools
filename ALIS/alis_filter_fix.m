function [emi] = alis_filter_fix(filter)
% ALIS_FILTER_FIX - convert ALIS filter to emission wavelength (A)
% 
% Calling:
%   [emi] = alis_filter_fix(filter)
% 
% Input:
%   FILTER - alis filter index, hopefully accepts the different
%            FILTER-keyword formats that we have in
%            ALIS-fits-files.
% 
% Output:
%   EMI - emission of interest 
% 
% Example: 
%   EMI = alis_filter_fix(0);
%   EMI = alis_filter_fix(557.7);

%   Copyright © 20050112 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

if isempty(filter)
  emi = -1;
  return
end
%        A-em A-fc nm-e  fnr
green = [5577 5590 557.7  0];
red =   [6300 6310 630.0  1];
ir =    [8446 8450 844.6  4];
blue =  [4278 4290 427.8  5];

f_diff(1) = min(abs(filter-green))/(filter+2*eps);
f_diff(2) = min(abs(filter-red))/(filter+2*eps);
f_diff(3) = min(abs(filter-ir))/(filter+2*eps);
f_diff(4) = min(abs(filter-blue))/(filter+2*eps);

[f_d_min,best_filter] = min(f_diff);

emi = 0;

if min(f_diff) < 0.1
  
  switch best_filter
   case 1 % green line
    emi = 5577;
   case 2
    emi = 6300;
   case 3
    emi = 8446;
   case 4
    emi = 4278;
   otherwise
    
    % All f_diff > .1 not really close to any well known filter
    % dificult to know what to do, so just return the filter as is
    % and leave further actions to the disappointed user.
    emi = filter
  end
  
end
