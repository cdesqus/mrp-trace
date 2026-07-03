export type AuthUser = {
  id:number;
  username:string;
  full_name:string;
  email:string|null;
  roles:string[];
  permissions:string[];
  must_change_password:boolean;
};
