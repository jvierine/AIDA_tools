function PO = ALIS_fix_endian(PO,date_obs)
% ALIS_FIX_ENDIAN - set the right endian-field in the preprocessing options struct
%   
% Calling:
%   PO = ALIS_fix_endian(PO,date_obs)
% Input:
%   PO - struct with pre-processing options as returned from
%        typical_pre_proc_ops 
%   date_obs - array with [yyyy, mm, dd,...]
% Output:
%   PO - pre-processing options struct with the right BE/LE field
%        set
% 
% Example:
%   PO = typical_pre_proc_ops('ALIS');
%   PO = ALIS_fix_endian(PO,[1999 02 16 17 36 10]);
%   % ...
%   PO = ALIS_fix_endian(PO,[2002 03 10]);
%   
% See also ALIS_GET_RIGHT_ENDIAN, TYPICAL_PRE_PROC_OPS, INIMG


%   Copyright © 2014 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

Endian = ALIS_get_right_endian(date_obs);

switch Endian
 case 'BE'
  PO.BE = 1;
  if isfield(PO,'LE') 
    PO = rmfield(PO,'LE');
  end
 case 'LE'
  PO.LE = 1;
  if isfield(PO,'BE') 
    PO = rmfield(PO,'BE');
  end
 otherwise
  disp('Dont know how this happened, but: ALIS_fix_endian failed.')
end
