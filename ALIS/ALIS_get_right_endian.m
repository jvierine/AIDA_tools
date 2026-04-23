function Endian = ALIS_get_right_endian(date_obs)
% ALIS_GET_RIGHT_ENDIAN - get the right endian for ALIS' fits files
%   
% Calling:
%   Endian = ALIS_get_right_endian(date_obs)
% Input:
%   date_obs - array with date [1 x 3] or time [1 x 6] starting
%              with [yyyy, mm, dd, ...] (will handle any other
%              array format by using date_obs(1:3) as [yyyy mm dd])
% Output:
%   Endian - string with 'LE' for the preiod when ALIS data was
%            stored in little endian format (1999-10 to 2004-05),
%            'BE' for other time-periods
% 
% Example:
%   date_of_interest = [2002 03 07;]
%   Endian = ALIS_get_right_endian(date_of_interest)
% 
% See also: ALIS_fix_endian, fits1, fits2, inimg

%   Copyright © 2014 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

LE_starddate = date2juldate([1999,8,1]);
LE_enddate   = date2juldate([2004,8,1]);

jdate_obs = date2juldate(date_obs(1:3));

Endian = 'BE';
if LE_starddate < jdate_obs && jdate_obs < LE_enddate
  Endian = 'LE';
end
