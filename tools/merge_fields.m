function S_out = merge_fields(S1,S2,field_names)
% MERGE_FIELDS - Merge all or some fields of S2 into S1.
%   
% Calling:
%  S_out = merge_fields(S1,S2,field_names)
% Input:
%  S1 - struct that fields in S2 will be copied to
%  S2 - struct whos fields will be copied to S1
%  field_names - cell or string-array with names of fields to copy from S2
%                to S1, optional input
% Output:
%  S_out - struct with all or selected fields from S2 copied into S1

% Copyright Björn Gustavsson 2011-06-28, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later


S_out = S1;

fields2 = fieldnames(S2);
if nargin > 2
  fields2 = intersect(field_names,fields2);
end
for curr_field = fields2(:)'
  S_out = setfield(S_out,curr_field{:},getfield(S2,curr_field{:}));
end
