function i_Found = skmp_disp_named(SkMp,name2find)

iFound = skmp_find_w_name(SkMp,name2find);

if iFound > 0
  disp(SkMp.star_list(iFound))
end
if nargout
  i_Found = iFound;
end
