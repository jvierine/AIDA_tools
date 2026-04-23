function is_in_range = find_in_ranges(t,t_ranges)
% FIND_IN_RANGES - Find which range out of T_RANGES elements of T is in.
%   
% Calling:
%  is_in_range = find_in_ranges(t,t_ranges)
% Input:
%  t - array of numbers to search in [n_t x 1] or [1 x n_t]
%  t_ranges - boundaries of ranges to check membership of elements
%             in t, array [n_ranges x 2]
% Output:
%  is_in_range - array with same size as t, with indices of the ranges in
%                t_ranges the elements in t falls into.
%
% NOTE - ONLY WORKS FOR NON-OVERLAPPING RANGES

%   Copyright � 2003 Bjorn Gustavsson <bjorn.gustavsson@irf.se>, 
%   This is free software, licensed under GNU GPL version 2 or later



if nargin ~= 2
  error('Wrong number of arguments')
end

if min(size(t_ranges)) == 1
  
  Tranges = reshape(t_ranges,2,[])';
  %This below should just be a simple reshape, just as the one above
  % for i = 1:length(t_ranges)/2,
  %   Tranges(i,1) = t_ranges(1+2*(i-1));%,[2 length(t_ranges)/2]);
  %   Tranges(i,2) = t_ranges(2*i);
  % end
  
else
  
  Tranges = t_ranges;
  
end
%Tranges
is_in_range = 0*t;
for i1 = 1:length(Tranges(:,1))
  is_in_range = is_in_range + i1*( Tranges(i1,1)<=t & t<Tranges(i1,2) );
end
