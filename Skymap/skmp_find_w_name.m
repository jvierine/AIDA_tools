function iFound = skmp_find_w_name(SkMp,name2find)
% skmp_find_w_name - finds SkMp.star_list item with Name matching NAME2FIND
% 
% Calling: 
%  iFound = skmp_find_w_name(SkMp,name2find)
% Input:
%  SkMp - skymap-struct as produced with the skymap function
%  name2find - char array with name of celestial object (stars, moon or
%              planet) to search for. Typically capitalized first character
% Output:
%  iFound - index (integer) to matching element, 0 if not found
% 
% See also: skymap
iFound = 0;
for i1 = 1:numel(SkMp.star_list)
  if strcmp(SkMp.star_list(i1).Name,name2find)
    iFound = i1;
    break
  end
end
